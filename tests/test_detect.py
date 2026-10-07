import csv
from datetime import date
from pathlib import Path

import pytest

from sentinel.detect import analyze
from sentinel.eval import evaluate
from sentinel.policies_default import default_policy_map

DATA = Path(__file__).resolve().parent.parent / "data"
POL = default_policy_map()


def load():
    emp_ids, txns = {}, []
    with open(DATA / "demo_expenses.csv") as f:
        for i, r in enumerate(csv.DictReader(f), 1):
            txns.append({"id": i, "external_id": r["transaction_id"],
                         "employee_id": emp_ids.setdefault(r["employee_id"], len(emp_ids) + 1),
                         "employee_name": r["employee_name"], "department": r["department"],
                         "date": date.fromisoformat(r["date"]), "amount": float(r["amount"]),
                         "merchant": r["merchant"], "merchant_key": "".join(c for c in r["merchant"].lower() if c.isalnum()),
                         "category": r["category"], "receipt_present": r["receipt_present"] == "yes",
                         "approval_status": r["approval_status"], "payment_method": r["payment_method"],
                         "location": r["location"], "business_purpose": r["business_purpose"]})
    with open(DATA / "labels.csv") as f:
        labels = {r["transaction_id"]: r["label"] for r in csv.DictReader(f)}
    return txns, labels


@pytest.fixture(scope="module")
def run():
    txns, labels = load()
    found = analyze(txns, POL)
    by_ext = {t["external_id"]: found[t["id"]] for t in txns if t["id"] in found}
    return by_ext, labels, txns


def test_quality_gate(run):
    by_ext, labels, txns = run
    m = evaluate(by_ext, labels)
    print(m, f"findings={len(by_ext)}/{len(txns)}")
    assert m["top20_precision"] >= 0.85
    assert m["recall"] >= 0.80


def test_required_scenarios(run):
    by_ext, _, _ = run
    for tid in ["TXN-251001", "TXN-251003", "TXN-251004", "TXN-251005", "TXN-251006", "TXN-251007"]:
        assert tid in by_ext, tid
    assert "duplicate_exact" in by_ext["TXN-251003"]["anomaly_types"]
    assert "policy_limit" in by_ext["TXN-251001"]["anomaly_types"]
    assert "missing_receipt" in by_ext["TXN-251006"]["anomaly_types"]
    assert by_ext["TXN-251007"]["severity"] != "high"
    assert by_ext["TXN-251001"]["explanation"].startswith("₹18,500 exceeds")


def _txn(i, amount, d=date(2026, 10, 7), cat="Meals", merchant="Swiggy", receipt=True, emp=1):
    return {"id": i, "external_id": f"T{i}", "employee_id": emp, "employee_name": "Test", "department": "X",
            "date": d, "amount": amount, "merchant": merchant, "merchant_key": merchant.lower(), "category": cat,
            "receipt_present": receipt, "approval_status": "approved", "payment_method": "UPI",
            "location": "Chennai", "business_purpose": "x"}


def test_exact_duplicate_flags_later_only():
    out = analyze([_txn(1, 900), _txn(2, 900)], POL)
    assert 1 not in out and out[2]["anomaly_types"] == ["duplicate_exact"]
    assert out[2]["signals"][0]["evidence"]["duplicate_of"] == "T1"


def test_missing_receipt_alone_is_a_finding():
    out = analyze([_txn(1, 900, receipt=False)], POL)
    assert out[1]["risk_score"] >= 20 and out[1]["severity"] == "low"


def test_weekend_alone_is_not_a_finding():
    out = analyze([_txn(1, 1200, d=date(2026, 10, 3), cat="Office Supplies", merchant="Amazon")], POL)
    assert out == {}


def test_restricted_is_medium():
    out = analyze([_txn(1, 3000, cat="Gambling", merchant="Dream11")], POL)
    assert out[1]["severity"] == "medium" and out[1]["confidence"] == 0.95
