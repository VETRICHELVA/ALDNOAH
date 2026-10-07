"""API flow on a fresh SQLite DB: login, roles, upload validation, review workflow, audit."""
import os, tempfile
os.environ["DATABASE_URL"] = "sqlite:///" + tempfile.mktemp(suffix=".db")
from fastapi.testclient import TestClient  # noqa: E402
from sentinel.main import app  # noqa: E402

PW = "Sentinel@2026"


def client(email):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return c


def test_login_rejects_bad_password():
    r = TestClient(app).post("/api/auth/login", json={"email": "viewer@sentinel.demo", "password": "nope"})
    assert r.status_code == 401 and r.json()["detail"] == "Email or password is incorrect."
    assert TestClient(app).get("/api/expenses").status_code == 401


def test_review_workflow_and_roles():
    mgr, viewer = client("priya.sharma@sentinel.demo"), client("viewer@sentinel.demo")
    q = mgr.get("/api/anomalies").json()
    assert q["total"] > 0 and q["counts"]["needs_review"] == q["total"]
    scores = [f["risk_score"] for f in q["items"]]
    assert scores == sorted(scores, reverse=True)
    top = q["items"][0]
    assert viewer.post(f"/api/anomalies/{top['id']}/review", json={"action": "approve"}).status_code == 403
    assert mgr.post(f"/api/anomalies/{top['id']}/review", json={"action": "mark_legitimate"}).status_code == 422
    r = mgr.post(f"/api/anomalies/{top['id']}/review", json={"action": "mark_legitimate", "comment": "Client stay approved offline."})
    assert r.status_code == 200 and r.json()["status"] == "legitimate" and r.json()["message"] == "Marked legitimate."
    assert r.json()["audit"][-1]["comment"] == "Client stay approved offline."
    assert mgr.post(f"/api/anomalies/{top['id']}/review", json={"action": "approve"}).status_code == 409
    d = mgr.get("/api/dashboard").json()
    assert d["metrics"]["unresolved"] == q["total"] - 1
    # re-run analysis keeps the reviewed decision
    mgr.post("/api/analysis/run")
    assert mgr.get(f"/api/anomalies/{top['id']}").json()["status"] == "legitimate"
    det = mgr.get(f"/api/anomalies/{q['items'][1]['id']}").json()
    assert det["signals"] and det["explanation"] and det["queue"]["total"] == q["total"] - 1


def test_upload_validation_and_error_report():
    mgr = client("priya.sharma@sentinel.demo")
    csv_data = ("transaction_id,employee_id,employee_name,department,date,amount,currency,merchant,category,receipt_present\n"
                "T-NEW-1,E900,Ritu Bose,Finance,2026-09-01,\"₹1,200\",INR,Swiggy,Meals,yes\n"
                "T-NEW-2,E900,Ritu Bose,Finance,2026-13-40,500,INR,Swiggy,Meals,yes\n"
                "T-NEW-3,E900,Ritu Bose,Finance,2026-09-02,-5,USD,Swiggy,Pets,maybe\n")
    r = mgr.post("/api/expenses/upload", files={"file": ("x.csv", csv_data, "text/csv")})
    assert r.status_code == 200, r.text
    b = r.json()
    assert (b["rows_total"], b["rows_valid"], b["rows_rejected"]) == (3, 1, 2)
    err = mgr.get(f"/api/imports/{b['id']}/errors.csv").text
    assert "not a recognised date" in err and "Only INR" in err
    assert mgr.post("/api/expenses/upload", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 422
    assert client("viewer@sentinel.demo").post("/api/expenses/upload", files={"file": ("x.csv", csv_data)}).status_code == 403


def test_export_escapes_formulas():
    mgr = client("priya.sharma@sentinel.demo")
    csv_data = ("transaction_id,employee_id,employee_name,department,date,amount,currency,merchant,category,receipt_present\n"
                "T-INJ-1,E901,Sam Paul,Finance,2026-09-01,100,INR,=HYPERLINK(\"x\"),Meals,yes\n")
    mgr.post("/api/expenses/upload", files={"file": ("y.csv", csv_data)})
    out = mgr.get("/api/expenses/export.csv", params={"q": "T-INJ-1"}).text
    assert "'=HYPERLINK" in out


def test_delete_import_and_all_data():
    mgr = client("priya.sharma@sentinel.demo")
    csv_data = ("transaction_id,employee_id,employee_name,department,date,amount,currency,merchant,category,receipt_present\n"
                "T-DEL-1,E950,Asha Nair,Finance,2026-09-01,900,INR,Swiggy,Meals,no\n")
    imp = mgr.post("/api/expenses/upload", files={"file": ("del.csv", csv_data)}).json()
    before = mgr.get("/api/expenses", params={"q": "T-DEL-1"}).json()["total"]
    assert before == 1
    assert client("viewer@sentinel.demo").delete(f"/api/imports/{imp['id']}").status_code == 403
    r = mgr.delete(f"/api/imports/{imp['id']}")
    assert r.status_code == 200 and r.json()["deleted"] == 1
    assert mgr.get("/api/expenses", params={"q": "T-DEL-1"}).json()["total"] == 0
    assert all(i["id"] != imp["id"] for i in mgr.get("/api/imports").json())
    assert mgr.delete(f"/api/imports/{imp['id']}").status_code == 404
    # delete everything, including reviewed findings
    r = mgr.delete("/api/expenses")
    assert r.status_code == 200 and r.json()["analysis"]["transactions"] == 0
    assert mgr.get("/api/expenses").json()["total"] == 0 and mgr.get("/api/anomalies", params={"tab": "all"}).json()["total"] == 0
    assert mgr.get("/api/imports").json() == []
    assert any(row[4] == "delete_all" for row in mgr.get("/api/reports/audit").json()["rows"])


def test_absent_receipt_and_approval_columns_are_unknown_not_missing():
    mgr = client("priya.sharma@sentinel.demo")
    csv_data = ("transaction_id,employee_id,employee_name,department,date,amount,currency,merchant,category\n"
                "T-MIN-1,E960,Kavya Rao,Finance,2026-09-01,40000,INR,Zoho Corporation,Software\n"
                "T-MIN-2,E960,Kavya Rao,Finance,2026-09-02,300,INR,Ola,Transport\n")
    r = mgr.post("/api/expenses/upload", files={"file": ("min.csv", csv_data)}).json()
    assert r["rows_valid"] == 2, r["errors_preview"]
    items = mgr.get("/api/expenses", params={"q": "T-MIN"}).json()["items"]
    for it in items:
        e = mgr.get(f"/api/expenses/{it['id']}").json()
        assert e["receipt_present"] is None and e["approval_status"] == "unknown"
        types = (e["finding"] or {}).get("anomaly_types", [])
        assert "missing_receipt" not in types and "missing_approval" not in types
