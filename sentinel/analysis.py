"""Import + whole-dataset analysis + demo seeding."""
import os
import time
from pathlib import Path

import bcrypt
from sqlalchemy import delete, func, select

from . import ingest
from .db import (RESOLVED, Base, Department, Employee, Finding, Import, Policy, ReviewAction,
                 Transaction, User, audit, engine)
from .detect import analyze
from .policies_default import DEFAULT_POLICIES, POLICY_FIELDS

DATA = Path(__file__).resolve().parent.parent / "data"
DEMO_PASSWORD = "Sentinel@2026"
DEMO_USERS = [("admin@sentinel.demo", "Arjun Mehta", "ADMIN"),
              ("priya.sharma@sentinel.demo", "Priya Sharma", "FINANCE_MANAGER"),
              ("reviewer@sentinel.demo", "Karthik Iyer", "REVIEWER"),
              ("viewer@sentinel.demo", "Neha Kapoor", "VIEWER")]


def policy_map(s) -> dict[str, dict]:
    return {p.category: {f: getattr(p, f) for f in POLICY_FIELDS}
            for p in s.scalars(select(Policy).where(Policy.active))}


def import_file(s, filename: str, data: bytes, user: User) -> Import:
    raw = ingest.read_table(filename, data)
    existing = set(s.scalars(select(Transaction.external_id)))
    cats = list(s.scalars(select(Policy.category)))
    rows, errors = ingest.validate(raw, cats, existing)
    depts = {d.name: d for d in s.scalars(select(Department))}
    emps = {e.code: e for e in s.scalars(select(Employee))}
    imp = Import(filename=filename[:300], uploaded_by=user.name, rows_total=len(raw), rows_valid=len(rows),
                 rows_rejected=len({e["row"] for e in errors}), errors=errors)
    s.add(imp)
    s.flush()
    for r in rows:
        dept = depts.get(r["department"])
        if not dept:
            dept = depts[r["department"]] = Department(name=r["department"])
            s.add(dept)
            s.flush()
        emp = emps.get(r["employee_code"])
        if not emp:
            emp = emps[r["employee_code"]] = Employee(code=r["employee_code"], name=r["employee_name"], department_id=dept.id)
            s.add(emp)
            s.flush()
        fields = {k: v for k, v in r.items() if k not in ("employee_code", "employee_name", "department")}
        s.add(Transaction(import_id=imp.id, employee_id=emp.id, **fields))
    s.flush()
    imp.analysis = run(s)
    audit(s, user.id, "import", imp.id, "import", filename=filename, valid=imp.rows_valid, rejected=imp.rows_rejected)
    return imp


def run(s) -> dict:
    t0 = time.perf_counter()
    txns = s.scalars(select(Transaction)).unique().all()
    dicts = [{"id": t.id, "external_id": t.external_id, "employee_id": t.employee_id,
              "employee_name": t.employee.name, "department": t.employee.department.name, "date": t.date,
              "amount": t.amount, "merchant": t.merchant, "merchant_key": t.merchant_key, "category": t.category,
              "receipt_present": t.receipt_present, "approval_status": t.approval_status,
              "payment_method": t.payment_method, "location": t.location, "business_purpose": t.business_purpose}
             for t in txns]
    results = analyze(dicts, policy_map(s)) if dicts else {}
    existing = {f.transaction_id: f for f in s.scalars(select(Finding)).unique()}
    reviewed = set(s.scalars(select(ReviewAction.finding_id)))
    fields = ("risk_score", "severity", "confidence", "anomaly_types", "primary_label", "signals", "evidence",
              "explanation", "recommended_action", "confidence_note")
    for tid, f in existing.items():
        if f.status in RESOLVED:
            continue  # reviewed decisions are never rewritten
        if tid in results:
            for k in fields:
                setattr(f, k, results[tid][k])
        elif f.id not in reviewed:
            s.delete(f)
    for tid, r in results.items():
        if tid not in existing:
            s.add(Finding(transaction_id=tid, **{k: r[k] for k in fields}))
    s.flush()
    sev = dict(s.execute(select(Finding.severity, func.count()).group_by(Finding.severity)).all())
    n_find = sum(sev.values())
    return {"transactions": len(txns), "findings": n_find, "high": sev.get("high", 0),
            "medium": sev.get("medium", 0), "low": sev.get("low", 0),
            "auto_cleared_pct": round(100 * (1 - n_find / len(txns)), 1) if txns else 100.0,
            "duration_ms": int((time.perf_counter() - t0) * 1000)}


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def ensure_seeded(s) -> None:
    Base.metadata.create_all(engine)
    if s.scalar(select(func.count()).select_from(User)):
        return
    pw = hash_pw(os.environ.get("DEMO_PASSWORD", DEMO_PASSWORD))
    for email, name, role in DEMO_USERS:
        s.add(User(email=email, name=name, role=role, password_hash=pw))
    for p in DEFAULT_POLICIES:
        s.add(Policy(**dict(zip(POLICY_FIELDS, p))))
    s.flush()
    demo = DATA / "demo_expenses.csv"
    if os.environ.get("SEED_DEMO", "1") == "1" and demo.exists():
        import_file(s, "demo_expenses.csv", demo.read_bytes(), s.scalar(select(User).where(User.role == "FINANCE_MANAGER")))
    s.commit()


def reset(s) -> None:
    """Drop everything (used by tests)."""
    for t in reversed(Base.metadata.sorted_tables):
        s.execute(delete(t))
    s.commit()
