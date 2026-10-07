"""Parse → validate → normalize expense files. Pure functions; DB writes live in analysis.import_rows."""
import csv
import io
import re
from datetime import date, datetime, timedelta

REQUIRED = ["transaction_id", "employee_id", "employee_name", "department", "date", "amount",
            "currency", "merchant", "category"]
OPTIONAL = ["payment_method", "location", "business_purpose", "receipt_present", "receipt_id",
            "policy_limit", "approval_status"]
ALIASES = {"food": "Meals", "meal": "Meals", "flights": "Travel", "flight": "Travel", "hotel": "Accommodation",
           "cab": "Local Transport", "taxi": "Local Transport", "software": "Software Subscription",
           "saas": "Software Subscription", "stationery": "Office Supplies", "conference": "Training & Conferences",
           "training": "Training & Conferences", "telecom": "Telecom & Internet", "internet": "Telecom & Internet",
           "entertainment": "Client Entertainment", "transport": "Local Transport", "personal": "Personal Expenses"}
TRUE = {"yes", "true", "1", "y"}
FALSE = {"no", "false", "0", "n"}
MAX_AMOUNT = 10_000_000


class FileError(ValueError):
    pass


def _key(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(h or "").strip().lower()).strip("_")


def read_table(filename: str, data: bytes) -> list[dict]:
    name = filename.lower()
    if name.endswith(".csv"):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        rows = list(csv.reader(io.StringIO(text)))
    elif name.endswith(".xlsx"):
        from openpyxl import load_workbook
        try:
            ws = load_workbook(io.BytesIO(data), read_only=True, data_only=True).active
        except Exception:
            raise FileError("The Excel file could not be read. Save it as .xlsx and try again.")
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    else:
        raise FileError("Only .csv and .xlsx files are supported.")
    if not rows:
        raise FileError("The file is empty.")
    header = [_key(h) for h in rows[0]]
    missing = [c for c in REQUIRED if c not in header]
    if missing:
        raise FileError(f"Missing required columns: {', '.join(missing)}.")
    return [dict(zip(header, r)) for r in rows[1:] if any(v not in (None, "") for v in r)]


def parse_date(v) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, (int, float)) and 20000 < v < 80000:  # Excel serial
        return date(1899, 12, 30) + timedelta(days=int(v))
    s = str(v or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%b-%Y", "%d %b %Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def parse_amount(v) -> float | None:
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"(?i)rs\.?|inr|₹|,|\s", "", str(v or ""))
    try:
        return float(s)
    except ValueError:
        return None


def parse_bool(v):
    """True / False / None (blank or column absent = unknown). Raises ValueError on anything else."""
    s = str(v if v is not None else "").strip().lower()
    if s == "":
        return None
    if s in TRUE | FALSE:
        return s in TRUE
    raise ValueError(s)


def merchant_key(m: str) -> str:
    return re.sub(r"[^a-z0-9]", "", m.lower())


def validate(raw_rows: list[dict], categories: list[str], existing_ids: set[str], today: date | None = None):
    """Returns (valid_rows, errors). errors: [{row, field, message, raw}] (row = 1-based file line)."""
    today = today or date.today()
    canon = {c.lower(): c for c in categories} | {k: v for k, v in ALIASES.items() if v in categories}
    seen: set[str] = set()
    valid, errors = [], []
    for i, r in enumerate(raw_rows, start=2):
        errs = []
        get = lambda k: "" if r.get(k) is None else str(r.get(k)).strip()  # noqa: E731
        for k in REQUIRED:
            if get(k) == "":
                errs.append((k, f"{k} is missing."))
        amount = parse_amount(r.get("amount"))
        if get("amount") and (amount is None or amount <= 0 or amount > MAX_AMOUNT):
            errs.append(("amount", f"Amount '{get('amount')}' is not a valid positive number."))
        d = parse_date(r.get("date"))
        if get("date") and d is None:
            errs.append(("date", f"Date '{get('date')}' is not a recognised date (use YYYY-MM-DD)."))
        elif d and d > today:
            errs.append(("date", f"Date {d.isoformat()} is in the future."))
        if get("currency") and get("currency").upper() != "INR":
            errs.append(("currency", f"Currency '{get('currency')}' is not supported. Only INR is supported in this version."))
        cat = canon.get(get("category").lower())
        if get("category") and not cat:
            errs.append(("category", f"Category '{get('category')}' does not match any policy category."))
        tid = get("transaction_id")
        if tid and (tid in seen or tid in existing_ids):
            errs.append(("transaction_id", f"Transaction ID {tid} appears more than once or was already imported."))
        try:
            receipt = parse_bool(r.get("receipt_present"))
        except ValueError:
            errs.append(("receipt_present", f"receipt_present '{get('receipt_present')}' must be yes, no or blank."))
        seen.add(tid)
        if errs:
            raw = {k: ("" if v is None else str(v)) for k, v in r.items()}
            errors += [{"row": i, "field": f, "message": m, "raw": raw} for f, m in errs]
            continue
        merchant = re.sub(r"\s+", " ", get("merchant"))
        valid.append({
            "external_id": tid, "employee_code": get("employee_id"), "employee_name": get("employee_name"),
            "department": get("department"), "date": d, "amount": round(amount, 2), "currency": "INR",
            "merchant": merchant, "merchant_key": merchant_key(merchant), "category": cat,
            "payment_method": get("payment_method"), "location": get("location"),
            "business_purpose": get("business_purpose"), "receipt_present": receipt,
            "receipt_id": get("receipt_id") or None,
            "approval_status": (get("approval_status") or "unknown").lower().replace(" ", "_"),
        })
    return valid, errors
