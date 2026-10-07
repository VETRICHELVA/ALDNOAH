"""Expense Sentinel API. Contract: docs/api-contract.md."""
import csv
import io
import os
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import bcrypt
import jwt
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from . import analysis, ingest
from .db import (RESOLVED, UNRESOLVED, AuditLog, Employee, Department, Finding, Import, Policy, ReviewAction,
                 SessionLocal, Transaction, User, audit, now)

app = FastAPI(title="Expense Sentinel API", docs_url="/api/docs", openapi_url="/api/openapi.json")
SECRET = os.environ.get("JWT_SECRET", "dev-only-secret-change-me-0123456789abcdef")
SECURE_COOKIE = os.environ.get("VERCEL") == "1"
RANK = {"VIEWER": 0, "REVIEWER": 1, "FINANCE_MANAGER": 2, "ADMIN": 3}
POLICY_CODES = {"policy_limit", "restricted_category", "missing_receipt", "missing_approval"}
DUP_CODES = {"duplicate_exact", "duplicate_near"}
MAX_UPLOAD = 4 * 1024 * 1024
_seeded = False


# ---------- session / auth ----------
def db():
    global _seeded
    s = SessionLocal()
    try:
        if not _seeded:
            analysis.ensure_seeded(s)
            _seeded = True
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def user_of(min_role: str = "VIEWER"):
    def dep(request: Request, s=Depends(db)) -> User:
        token = request.cookies.get("session")
        try:
            uid = int(jwt.decode(token or "", SECRET, algorithms=["HS256"])["sub"])
        except Exception:
            raise HTTPException(401, "Your session has expired. Sign in again.")
        u = s.get(User, uid)
        if not u:
            raise HTTPException(401, "Your session has expired. Sign in again.")
        if RANK[u.role] < RANK[min_role]:
            raise HTTPException(403, "Your role does not allow this action.")
        return u
    return dep


def U(u: User | None):
    return u and {"id": u.id, "email": u.email, "name": u.name, "role": u.role}


class LoginIn(BaseModel):
    email: str
    password: str


@app.post("/api/auth/login")
def login(body: LoginIn, response: Response, s=Depends(db)):
    u = s.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not u or not bcrypt.checkpw(body.password.encode(), u.password_hash.encode()):
        raise HTTPException(401, "Email or password is incorrect.")
    token = jwt.encode({"sub": str(u.id), "exp": datetime.now(timezone.utc) + timedelta(hours=8)}, SECRET, "HS256")
    response.set_cookie("session", token, httponly=True, samesite="lax", secure=SECURE_COOKIE, max_age=8 * 3600)
    audit(s, u.id, "user", u.id, "login")
    return U(u)


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie("session")


@app.get("/api/auth/me")
def me(u=Depends(user_of())):
    return U(u)


# ---------- serializers ----------
def policy_status(t: Transaction, pol: dict) -> str:
    p = pol.get(t.category) or {}
    if p.get("restricted"):
        return "restricted"
    if p.get("max_amount") and t.amount > p["max_amount"]:
        return "over_limit"
    if p.get("receipt_required") and not t.receipt_present:
        return "missing_receipt"
    return "within"


def row(t: Transaction, pol: dict):
    f = t.finding
    return {"id": t.id, "external_id": t.external_id, "date": t.date.isoformat(),
            "employee": {"id": t.employee.id, "name": t.employee.name, "department": t.employee.department.name},
            "merchant": t.merchant, "category": t.category, "amount": t.amount,
            "policy_status": policy_status(t, pol), "review_status": t.review_status,
            "finding": f and {"id": f.id, "risk_score": f.risk_score, "severity": f.severity,
                              "primary_label": f.primary_label, "status": f.status}}


def expense(t: Transaction, pol: dict):
    p = pol.get(t.category)
    return row(t, pol) | {"currency": t.currency, "payment_method": t.payment_method, "location": t.location,
                          "business_purpose": t.business_purpose, "receipt_present": t.receipt_present,
                          "receipt_id": t.receipt_id, "approval_status": t.approval_status, "import_id": t.import_id,
                          "policy": p and policy_out_dict(p)}


def policy_out_dict(p) -> dict:
    keys = ("id", "category", "max_amount", "receipt_required", "approval_threshold", "approver_role", "restricted",
            "weekend_allowed", "active")
    return {k: (p.get(k) if isinstance(p, dict) else getattr(p, k)) for k in keys}


def finding_row(f: Finding, pol: dict):
    return {"id": f.id, "transaction": row(f.transaction, pol), "risk_score": f.risk_score, "severity": f.severity,
            "confidence": f.confidence, "anomaly_types": f.anomaly_types, "primary_label": f.primary_label,
            "explanation": f.explanation, "status": f.status, "assignee": U(f.assignee),
            "created_at": f.created_at.isoformat()}


def policies_full(s) -> dict:
    return {p.category: policy_out_dict(p) for p in s.scalars(select(Policy))}


def audit_entries(s, finding_id: int | None, txn_id: int):
    out = []
    if finding_id:
        for a, name in s.execute(select(ReviewAction, User.name).join(User, User.id == ReviewAction.user_id)
                                 .where(ReviewAction.finding_id == finding_id).order_by(ReviewAction.created_at)):
            out.append({"at": a.created_at.isoformat(), "user": name, "action": a.action,
                        "prev_status": a.prev_status, "new_status": a.new_status, "comment": a.comment})
    t = s.get(Transaction, txn_id)
    out.insert(0, {"at": (t.finding.created_at if t.finding else now()).isoformat(), "user": "System",
                   "action": "imported and analysed", "prev_status": None,
                   "new_status": t.finding.status if t.finding and not out else None, "comment": None})
    return out


def pct(vals, q):
    if not vals:
        return 0
    v = sorted(vals)
    k = (len(v) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return round(v[lo] + (v[hi] - v[lo]) * (k - lo), 2)


# ---------- anomalies ----------
Tab = Literal["all", "needs_review", "high_risk", "policy", "duplicates", "resolved"]


def tab_match(f: Finding, tab: str) -> bool:
    types = set(f.anomaly_types)
    return {"all": True, "needs_review": f.status in UNRESOLVED,
            "high_risk": f.severity == "high" and f.status in UNRESOLVED,
            "policy": bool(types & POLICY_CODES), "duplicates": bool(types & DUP_CODES),
            "resolved": f.status in RESOLVED}[tab]


def queue(s, tab, q, severity, category, department, assignee_id, sort):
    # ponytail: filters findings in Python (findings are ~5% of rows); move to SQL past ~50k findings
    allf = s.scalars(select(Finding)).unique().all()
    counts = {t: sum(tab_match(f, t) for f in allf) for t in Tab.__args__}
    ql = (q or "").lower()
    out = [f for f in allf if tab_match(f, tab)
           and (not severity or f.severity == severity)
           and (not category or f.transaction.category == category)
           and (not department or f.transaction.employee.department.name == department)
           and (not assignee_id or f.assignee_id == assignee_id)
           and (not ql or ql in f"{f.transaction.employee.name} {f.transaction.merchant} {f.transaction.external_id} {f.primary_label}".lower())]
    key = {"risk": lambda f: (f.risk_score, f.transaction.date), "date": lambda f: f.transaction.date,
           "amount": lambda f: f.transaction.amount, "confidence": lambda f: f.confidence}[sort.lstrip("-")]
    out.sort(key=key, reverse=sort.startswith("-"))
    return out, counts


def qparams(tab: Tab = "needs_review", q: str | None = None, severity: str | None = None,
            category: str | None = None, department: str | None = None, assignee_id: int | None = None,
            sort: Literal["-risk", "risk", "-date", "date", "-amount", "amount", "-confidence", "confidence"] = "-risk"):
    return dict(tab=tab, q=q, severity=severity, category=category, department=department,
                assignee_id=assignee_id, sort=sort)


@app.get("/api/anomalies")
def list_anomalies(p=Depends(qparams), page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                   s=Depends(db), _=Depends(user_of())):
    items, counts = queue(s, **p)
    pol = policies_full(s)
    return {"items": [finding_row(f, pol) for f in items[(page - 1) * page_size: page * page_size]],
            "total": len(items), "page": page, "page_size": page_size, "counts": counts}


def finding_detail(s, f: Finding, p: dict | None):
    pol = policies_full(s)
    t = f.transaction
    emp = s.scalars(select(Transaction).where(Transaction.employee_id == t.employee_id, Transaction.id != t.id)
                    .order_by(Transaction.date.desc())).unique().all()
    emp_amts = [x.amount for x in emp]
    emp_cat = [x.amount for x in emp if x.category == t.category]
    cat = list(s.scalars(select(Transaction.amount).where(Transaction.category == t.category, Transaction.id != t.id)))
    dup_ids = [sig["evidence"].get("duplicate_of") for sig in f.signals if sig["code"] in DUP_CODES]
    dups = s.scalars(select(Transaction).where(Transaction.external_id.in_([d for d in dup_ids if d]))).unique().all()
    m_emp = sum(1 for x in emp if x.merchant_key == t.merchant_key)
    m_all = list(s.scalars(select(Transaction.amount).where(Transaction.merchant_key == t.merchant_key)))
    qinfo = {"position": 0, "total": 0, "prev_id": None, "next_id": None}
    if p is not None:
        items, _ = queue(s, **p)
        ids = [x.id for x in items]
        if f.id in ids:
            i = ids.index(f.id)
            qinfo = {"position": i + 1, "total": len(ids), "prev_id": ids[i - 1] if i else None,
                     "next_id": ids[i + 1] if i + 1 < len(ids) else None}
        else:
            qinfo = {"position": 0, "total": len(ids), "prev_id": None, "next_id": ids[0] if ids else None}
    return finding_row(f, pol) | {
        "transaction": expense(t, pol), "signals": f.signals, "recommended_action": f.recommended_action,
        "confidence_note": f.confidence_note, "evidence": f.evidence,
        "context": {
            "employee_history": [row(x, pol) for x in emp[:10]],
            "employee_baseline": {"median": round(statistics.median(emp_amts), 2) if emp_amts else 0,
                                  "mean": round(statistics.fmean(emp_amts), 2) if emp_amts else 0, "n": len(emp_amts),
                                  "category_median": round(statistics.median(emp_cat), 2) if emp_cat else None},
            "category_benchmark": {"median": pct(cat, .5), "p25": pct(cat, .25), "p75": pct(cat, .75),
                                   "p90": pct(cat, .9), "n": len(cat)},
            "policy": pol.get(t.category),
            "duplicates": [row(x, pol) for x in dups],
            "merchant_history": {"employee_count": m_emp, "company_count": len(m_all),
                                 "company_median": pct(m_all, .5)},
        },
        "audit": audit_entries(s, f.id, t.id),
        "queue": qinfo,
    }


@app.get("/api/anomalies/{fid}")
def get_anomaly(fid: int, p=Depends(qparams), s=Depends(db), _=Depends(user_of())):
    f = s.get(Finding, fid)
    if not f:
        raise HTTPException(404, "This finding no longer exists. It may have been cleared by a re-run of analysis.")
    return finding_detail(s, f, p)


ReviewActionT = Literal["approve", "reject", "mark_legitimate", "request_evidence", "assign", "escalate"]
TRANSITIONS = {"approve": ("approved", False), "reject": ("rejected", True), "mark_legitimate": ("legitimate", True),
               "request_evidence": ("evidence_requested", False), "assign": ("in_review", False),
               "escalate": ("escalated", True)}
DONE_MSG = {"approve": "Expense approved.", "reject": "Expense rejected.", "mark_legitimate": "Marked legitimate.",
            "request_evidence": "Evidence requested.", "assign": "Finding assigned.", "escalate": "Finding escalated."}


class ReviewIn(BaseModel):
    action: ReviewActionT
    comment: str | None = None
    assignee_id: int | None = None


def apply_review(s, f: Finding, body: ReviewIn, u: User):
    if f.status in RESOLVED:
        raise HTTPException(409, f"This finding was already resolved as {f.status}.")
    new, needs_comment = TRANSITIONS[body.action]
    comment = (body.comment or "").strip() or None
    if needs_comment and not comment:
        raise HTTPException(422, "Add a comment explaining this decision.")
    if body.action == "assign":
        a = s.get(User, body.assignee_id or 0)
        if not a or RANK[a.role] < RANK["REVIEWER"]:
            raise HTTPException(422, "Choose a reviewer to assign this finding to.")
        f.assignee_id = a.id
    prev = f.status
    f.status = new
    if new in RESOLVED:
        f.resolved_at, f.resolved_by = now(), u.id
        f.transaction.review_status = "rejected" if new == "rejected" else "approved"
    s.add(ReviewAction(finding_id=f.id, user_id=u.id, action=body.action, prev_status=prev, new_status=new, comment=comment))
    audit(s, u.id, "finding", f.id, body.action, prev_status=prev, new_status=new, comment=comment)


@app.post("/api/anomalies/{fid}/review")
def review(fid: int, body: ReviewIn, p=Depends(qparams), s=Depends(db), u=Depends(user_of("REVIEWER"))):
    f = s.get(Finding, fid)
    if not f:
        raise HTTPException(404, "Finding not found.")
    apply_review(s, f, body, u)
    s.flush()
    return finding_detail(s, f, p) | {"message": DONE_MSG[body.action]}


class BulkIn(BaseModel):
    ids: list[int]
    action: Literal["approve", "reject"]
    comment: str | None = None


@app.post("/api/anomalies/bulk-review")
def bulk_review(body: BulkIn, s=Depends(db), u=Depends(user_of("REVIEWER"))):
    if body.action == "reject" and not (body.comment or "").strip():
        raise HTTPException(422, "Add a comment explaining this decision.")
    updated = skipped = 0
    for fid in body.ids[:500]:
        f = s.get(Finding, fid)
        if not f or f.status in RESOLVED:
            skipped += 1
            continue
        apply_review(s, f, ReviewIn(action=body.action, comment=body.comment), u)
        updated += 1
    return {"updated": updated, "skipped": skipped}


# ---------- expenses ----------
def expense_query(q, date_from, date_to, employee_id, department, category, merchant, severity, risk_min, status):
    st = select(Transaction).join(Transaction.employee).join(Employee.department).outerjoin(Transaction.finding)
    if q:
        like = f"%{q.lower()}%"
        st = st.where(or_(func.lower(Employee.name).like(like), func.lower(Transaction.merchant).like(like),
                          func.lower(Transaction.external_id).like(like), func.lower(Transaction.business_purpose).like(like)))
    if date_from:
        st = st.where(Transaction.date >= date_from)
    if date_to:
        st = st.where(Transaction.date <= date_to)
    if employee_id:
        st = st.where(Transaction.employee_id == employee_id)
    if department:
        st = st.where(Department.name == department)
    if category:
        st = st.where(Transaction.category == category)
    if merchant:
        st = st.where(func.lower(Transaction.merchant).like(f"%{merchant.lower()}%"))
    if severity:
        st = st.where(Finding.severity == severity)
    if risk_min:
        st = st.where(Finding.risk_score >= risk_min)
    if status in ("pending", "approved", "rejected"):
        st = st.where(Transaction.review_status == status)
    elif status == "flagged":
        st = st.where(Finding.id.is_not(None))
    elif status == "cleared":
        st = st.where(Finding.id.is_(None))
    return st


def eparams(q: str | None = None, date_from: date | None = None, date_to: date | None = None,
            employee_id: int | None = None, department: str | None = None, category: str | None = None,
            merchant: str | None = None, severity: str | None = None, risk_min: int | None = None,
            status: Literal["pending", "approved", "rejected", "flagged", "cleared"] | None = None):
    return dict(q=q, date_from=date_from, date_to=date_to, employee_id=employee_id, department=department,
                category=category, merchant=merchant, severity=severity, risk_min=risk_min, status=status)


SORTS = {"date": Transaction.date, "amount": Transaction.amount, "risk": func.coalesce(Finding.risk_score, 0),
         "employee": Employee.name, "merchant": Transaction.merchant}


@app.get("/api/expenses")
def list_expenses(p=Depends(eparams), page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                  sort: Literal["date", "-date", "amount", "-amount", "risk", "-risk", "employee", "-employee",
                                "merchant", "-merchant"] = "-date", s=Depends(db), _=Depends(user_of())):
    st = expense_query(**p)
    total = s.scalar(select(func.count()).select_from(st.with_only_columns(Transaction.id).subquery()))
    col = SORTS[sort.lstrip("-")]
    st = st.order_by(col.desc() if sort.startswith("-") else col.asc(), Transaction.id.desc())
    items = s.scalars(st.offset((page - 1) * page_size).limit(page_size)).unique().all()
    pol = policies_full(s)
    return {"items": [row(t, pol) for t in items], "total": total, "page": page, "page_size": page_size}


def safe_cell(v):
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


def csv_response(name: str, columns: list[str], rows: list[list]):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(columns)
    w.writerows([[safe_cell(c) for c in r] for r in rows])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/api/expenses/export.csv")
def export_expenses(p=Depends(eparams), s=Depends(db), _=Depends(user_of("FINANCE_MANAGER"))):
    items = s.scalars(expense_query(**p).order_by(Transaction.date.desc())).unique().all()
    pol = policies_full(s)
    cols = ["transaction_id", "date", "employee", "department", "merchant", "category", "amount", "policy_status",
            "risk_score", "severity", "finding", "finding_status", "review_status", "receipt_present"]
    return csv_response("expenses.csv", cols, [[t.external_id, t.date, t.employee.name, t.employee.department.name,
                         t.merchant, t.category, t.amount, policy_status(t, pol),
                         t.finding and t.finding.risk_score, t.finding and t.finding.severity,
                         t.finding and t.finding.primary_label, t.finding and t.finding.status, t.review_status,
                         "yes" if t.receipt_present else "no"] for t in items])


@app.get("/api/expenses/{tid}")
def get_expense(tid: int, s=Depends(db), _=Depends(user_of())):
    t = s.get(Transaction, tid)
    if not t:
        raise HTTPException(404, "Expense not found.")
    pol = policies_full(s)
    return expense(t, pol) | {"finding": finding_detail(s, t.finding, None) if t.finding else None,
                              "audit": audit_entries(s, t.finding and t.finding.id, t.id)}


@app.post("/api/expenses/upload")
async def upload(file: UploadFile = File(...), s=Depends(db), u=Depends(user_of("FINANCE_MANAGER"))):
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "The file is larger than 4 MB. Split it into smaller files and upload each one.")
    try:
        imp = analysis.import_file(s, file.filename or "upload.csv", data, u)
    except ingest.FileError as e:
        raise HTTPException(422, str(e))
    return import_out(imp)


def import_out(i: Import):
    return {"id": i.id, "filename": i.filename, "created_at": i.created_at.isoformat(), "uploaded_by": i.uploaded_by,
            "rows_total": i.rows_total, "rows_valid": i.rows_valid, "rows_rejected": i.rows_rejected,
            "errors_preview": [{k: e[k] for k in ("row", "field", "message")} for e in (i.errors or [])[:20]],
            "analysis": i.analysis}


@app.get("/api/imports")
def list_imports(s=Depends(db), _=Depends(user_of())):
    return [import_out(i) for i in s.scalars(select(Import).order_by(Import.created_at.desc()))]


@app.get("/api/imports/{iid}/errors.csv")
def import_errors(iid: int, s=Depends(db), _=Depends(user_of())):
    i = s.get(Import, iid)
    if not i:
        raise HTTPException(404, "Import not found.")
    cols = ingest.REQUIRED + ingest.OPTIONAL
    return csv_response(f"import-{iid}-errors.csv", ["row", "field", "error"] + cols,
                        [[e["row"], e["field"], e["message"]] + [e["raw"].get(c, "") for c in cols] for e in i.errors or []])


@app.post("/api/analysis/run")
def run_analysis(s=Depends(db), u=Depends(user_of("FINANCE_MANAGER"))):
    out = analysis.run(s)
    audit(s, u.id, "analysis", None, "run", **out)
    return out


# ---------- dashboard / analytics ----------
def txns_in(s, date_from, date_to):
    st = select(Transaction)
    if date_from:
        st = st.where(Transaction.date >= date_from)
    if date_to:
        st = st.where(Transaction.date <= date_to)
    return s.scalars(st).unique().all()


def week(d: date) -> str:
    return (d - timedelta(days=d.weekday())).isoformat()


def metrics(ts):
    fs = [t.finding for t in ts if t.finding]
    unresolved = [f for f in fs if f.status in UNRESOLVED]
    return {"total_spend": round(sum(t.amount for t in ts), 2), "total_expenses": len(ts), "findings": len(fs),
            "high_risk": sum(f.severity == "high" for f in unresolved),
            "amount_at_risk": round(sum(f.transaction.amount for f in unresolved), 2),
            "policy_violations": sum(bool(set(f.anomaly_types) & POLICY_CODES) for f in fs),
            "unresolved": len(unresolved),
            "auto_cleared_pct": round(100 * (1 - len(fs) / len(ts)), 1) if ts else 100.0}


@app.get("/api/dashboard")
def dashboard(date_from: date | None = None, date_to: date | None = None, s=Depends(db), _=Depends(user_of())):
    ts = txns_in(s, date_from, date_to)
    prev = None
    if date_from and date_to:
        span = date_to - date_from + timedelta(days=1)
        prev = metrics(txns_in(s, date_from - span, date_from - timedelta(days=1)))
    trend = defaultdict(lambda: {"spend": 0.0, "flagged": 0.0})
    for t in ts:
        w = trend[week(t.date)]
        w["spend"] += t.amount
        if t.finding:
            w["flagged"] += t.amount
    pol = policies_full(s)
    fs = sorted([t.finding for t in ts if t.finding and t.finding.status in UNRESOLVED], key=lambda f: -f.risk_score)
    exc = defaultdict(lambda: [0, 0.0, ""])
    for t in ts:
        if t.finding:
            for sig in t.finding.signals:
                if sig["code"] in POLICY_CODES | DUP_CODES:
                    e = exc[sig["code"]]
                    e[0] += 1
                    e[1] += t.amount
                    e[2] = sig["label"]
    resolved = sum(1 for t in ts if t.finding and t.finding.status in RESOLVED)
    m = metrics(ts)
    return {"metrics": m, "previous": prev,
            "spend_trend": [{"week": k, "spend": round(v["spend"], 2), "flagged": round(v["flagged"], 2)}
                            for k, v in sorted(trend.items())],
            "top_findings": [finding_row(f, pol) for f in fs[:5]],
            "policy_exceptions": sorted([{"code": k, "label": v[2], "count": v[0], "amount": round(v[1], 2)}
                                         for k, v in exc.items()], key=lambda x: -x["count"]),
            "review_progress": {"resolved": resolved, "unresolved": m["unresolved"]}}


@app.get("/api/analytics")
def analytics(date_from: date | None = None, date_to: date | None = None, s=Depends(db), _=Depends(user_of())):
    ts = txns_in(s, date_from, date_to)

    def group(key):
        g = defaultdict(lambda: {"spend": 0.0, "expenses": 0, "findings": 0, "flagged_amount": 0.0})
        for t in ts:
            r = g[key(t)]
            r["spend"] += t.amount
            r["expenses"] += 1
            if t.finding:
                r["findings"] += 1
                r["flagged_amount"] += t.amount
        return sorted(g.items(), key=lambda kv: -kv[1]["spend"])

    rnd = lambda r: {k: round(v, 2) if isinstance(v, float) else v for k, v in r.items()}  # noqa: E731
    emp_dept = {t.employee.name: t.employee.department.name for t in ts}
    opened, resolved_w = defaultdict(int), defaultdict(int)
    sig = defaultdict(lambda: [0, ""])
    for t in ts:
        if t.finding:
            opened[week(t.date)] += 1
            if t.finding.resolved_at:
                resolved_w[week(t.finding.resolved_at.date())] += 1
            for x in t.finding.signals:
                sig[x["code"]][0] += 1
                sig[x["code"]][1] = x["label"]
    weeks = sorted(set(opened) | set(resolved_w))
    return {
        "by_department": [{"department": k} | rnd(v) for k, v in group(lambda t: t.employee.department.name)],
        "by_category": [{"category": k} | rnd(v) for k, v in group(lambda t: t.category)],
        "top_employees": [{"employee": k, "department": emp_dept[k]} | rnd(v) for k, v in group(lambda t: t.employee.name)[:15]],
        "top_vendors": [{"merchant": k, "spend": round(v["spend"], 2), "expenses": v["expenses"],
                         "flagged_share": round(v["flagged_amount"] / v["spend"], 3) if v["spend"] else 0}
                        for k, v in group(lambda t: t.merchant)[:15]],
        "findings_trend": [{"week": w, "opened": opened[w], "resolved": resolved_w[w]} for w in weeks],
        "signal_mix": sorted([{"code": k, "label": v[1], "count": v[0]} for k, v in sig.items()], key=lambda x: -x["count"]),
    }


# ---------- reports ----------
@app.get("/api/reports/{rtype}")
def report(rtype: Literal["spend", "policy", "anomaly", "employee", "vendor", "department", "audit"],
           date_from: date | None = None, date_to: date | None = None, format: Literal["json", "csv"] = "json",
           s=Depends(db), _=Depends(user_of())):
    ts = txns_in(s, date_from, date_to)
    if rtype == "audit":
        cols = ["at", "user", "entity", "entity_id", "action", "detail"]
        rows = [[a.created_at.isoformat(timespec="minutes"), a.user.name if a.user else "System", a.entity, a.entity_id,
                 a.action, ", ".join(f"{k}={v}" for k, v in (a.detail or {}).items() if v is not None)]
                for a in s.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(2000)).unique()]
    elif rtype == "anomaly":
        cols = ["transaction_id", "date", "employee", "department", "merchant", "category", "amount", "risk_score",
                "severity", "confidence", "finding", "explanation", "status"]
        rows = [[t.external_id, t.date.isoformat(), t.employee.name, t.employee.department.name, t.merchant, t.category,
                 t.amount, t.finding.risk_score, t.finding.severity, t.finding.confidence, t.finding.primary_label,
                 t.finding.explanation, t.finding.status]
                for t in sorted([t for t in ts if t.finding], key=lambda t: -t.finding.risk_score)]
    elif rtype == "policy":
        cols = ["transaction_id", "date", "employee", "category", "amount", "violation", "status"]
        rows = [[t.external_id, t.date.isoformat(), t.employee.name, t.category, t.amount, sig["label"], t.finding.status]
                for t in ts if t.finding for sig in t.finding.signals if sig["code"] in POLICY_CODES]
    else:
        key = {"spend": lambda t: t.category, "employee": lambda t: t.employee.name,
               "vendor": lambda t: t.merchant, "department": lambda t: t.employee.department.name}[rtype]
        g = defaultdict(lambda: [0, 0.0, 0, 0.0])
        for t in ts:
            r = g[key(t)]
            r[0] += 1
            r[1] += t.amount
            if t.finding:
                r[2] += 1
                r[3] += t.amount
        cols = [{"spend": "category"}.get(rtype, rtype), "expenses", "spend", "findings", "flagged_amount"]
        rows = [[k, v[0], round(v[1], 2), v[2], round(v[3], 2)] for k, v in sorted(g.items(), key=lambda kv: -kv[1][1])]
    if format == "csv":
        return csv_response(f"{rtype}-report.csv", cols, rows)
    return {"columns": cols, "rows": rows}


@app.get("/api/evaluation")
def evaluation(s=Depends(db), _=Depends(user_of())):
    path = analysis.DATA / "labels.csv"
    if not path.exists():
        return {"available": False}
    from .eval import evaluate
    labels = {r["transaction_id"]: r["label"] for r in csv.DictReader(path.open())}
    findings = {f.transaction.external_id: {"risk_score": f.risk_score, "severity": f.severity,
                                            "anomaly_types": f.anomaly_types}
                for f in s.scalars(select(Finding)).unique()}
    out = evaluate(findings, labels)
    fb = list(s.scalars(select(Finding.status).where(Finding.status.in_(RESOLVED))))
    out["reviewer_agreement"] = round(sum(x == "rejected" for x in fb) / len(fb), 3) if fb else None
    out["reviewed"] = len(fb)
    return out


# ---------- policies / users / settings ----------
class PolicyIn(BaseModel):
    category: str
    max_amount: float | None = None
    receipt_required: bool = True
    approval_threshold: float | None = None
    approver_role: str | None = None
    restricted: bool = False
    weekend_allowed: bool = True
    active: bool = True


@app.get("/api/policies")
def list_policies(s=Depends(db), _=Depends(user_of())):
    return [policy_out_dict(p) for p in s.scalars(select(Policy).order_by(Policy.category))]


@app.post("/api/policies")
def create_policy(body: PolicyIn, s=Depends(db), u=Depends(user_of("FINANCE_MANAGER"))):
    if s.scalar(select(Policy).where(func.lower(Policy.category) == body.category.strip().lower())):
        raise HTTPException(409, f"A policy for {body.category} already exists. Edit it instead.")
    p = Policy(**body.model_dump() | {"category": body.category.strip()})
    s.add(p)
    s.flush()
    audit(s, u.id, "policy", p.id, "create", **body.model_dump())
    return policy_out_dict(p)


@app.put("/api/policies/{pid}")
def update_policy(pid: int, body: PolicyIn, s=Depends(db), u=Depends(user_of("FINANCE_MANAGER"))):
    p = s.get(Policy, pid)
    if not p:
        raise HTTPException(404, "Policy not found.")
    before = policy_out_dict(p)
    for k, v in body.model_dump().items():
        if k != "category":
            setattr(p, k, v)
    audit(s, u.id, "policy", p.id, "update", before={k: v for k, v in before.items() if k != "id"}, after=body.model_dump())
    return policy_out_dict(p)


@app.get("/api/users")
def list_users(s=Depends(db), _=Depends(user_of())):
    return [U(u) for u in s.scalars(select(User).order_by(User.name))]


class RoleIn(BaseModel):
    role: Literal["ADMIN", "FINANCE_MANAGER", "REVIEWER", "VIEWER"]


@app.put("/api/users/{uid}")
def set_role(uid: int, body: RoleIn, s=Depends(db), u=Depends(user_of("ADMIN"))):
    t = s.get(User, uid)
    if not t:
        raise HTTPException(404, "User not found.")
    if t.id == u.id and body.role != "ADMIN":
        raise HTTPException(422, "You cannot remove your own admin role.")
    audit(s, u.id, "user", t.id, "role_change", prev=t.role, new=body.role)
    t.role = body.role
    return U(t)


@app.get("/api/settings")
def settings(_=Depends(user_of())):
    from .detect.risk import WEIGHTS, LABELS  # noqa
    return {"org": {"name": "Sentinel Demo Pvt Ltd", "currency": "INR", "timezone": "Asia/Kolkata"},
            "risk": {"weights": [{"code": k, "label": LABELS.get(k, k), "weight": w} for k, w in WEIGHTS.items()],
                     "thresholds": {"high": 70, "medium": 40, "low": 20}},
            "retention_days": 2555}
