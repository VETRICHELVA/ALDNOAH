"""Generate realistic demo expenses with planted, labelled anomalies.

Writes data/demo_expenses.csv and data/labels.csv. Deterministic (seed 7). Stdlib only.
"""
import csv
import math
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sentinel.policies_default import default_policy_map  # noqa: E402

random.seed(7)
OUT = Path(__file__).resolve().parent
POL = default_policy_map()
START, END = date(2026, 7, 1), date(2026, 10, 7)
DAYS = (END - START).days + 1
HOLI = {date(2026, 8, 15), date(2026, 8, 28), date(2026, 10, 2)}

DEPTS = {
    "Engineering": ["Priya Raman", "Karthik Subramanian", "Ananya Iyer", "Rohan Deshpande", "Sneha Kulkarni",
                    "Arjun Nair", "Divya Krishnan", "Vikram Bhat"],
    "Sales": ["Rahul Menon", "Neha Agarwal", "Siddharth Rao", "Pooja Venkatesh", "Aditya Joshi", "Kavya Reddy",
              "Manish Gupta", "Shreya Pillai"],
    "Marketing": ["Ishita Banerjee", "Nikhil Chawla", "Meera Natarajan", "Varun Malhotra", "Tanvi Shah",
                  "Abhishek Sinha", "Lakshmi Prasad", "Farhan Qureshi"],
    "Finance": ["Deepa Raghavan", "Suresh Kumar", "Anjali Mehta", "Gautam Iyengar", "Ritu Saxena",
                "Harish Chandran", "Nandini Rao", "Prakash Hegde"],
    "Operations": ["Ravi Shankar", "Swati Mishra", "Imran Sheikh", "Bhavana Murthy", "Sanjay Patil",
                   "Geetha Ramesh", "Ajay Thakur", "Revathi Sundaram"],
    "Customer Success": ["Aarti Desai", "Naveen Kumar", "Shalini Menon", "Kiran Jadhav", "Mohit Bansal",
                         "Preethi Anand", "Rajesh Iyer", "Sunita Verma"],
}
MIX = {  # category -> relative frequency per department
    "Engineering": {"Meals": 5, "Local Transport": 4, "Software Subscription": 3, "Telecom & Internet": 2,
                    "Training & Conferences": 1, "Office Supplies": 1, "Travel": 1},
    "Sales": {"Meals": 5, "Travel": 3, "Accommodation": 2, "Client Entertainment": 3, "Local Transport": 4,
              "Telecom & Internet": 1},
    "Marketing": {"Meals": 4, "Software Subscription": 2, "Client Entertainment": 2, "Travel": 1,
                  "Office Supplies": 2, "Local Transport": 3},
    "Finance": {"Meals": 4, "Office Supplies": 2, "Software Subscription": 1, "Telecom & Internet": 2,
                "Training & Conferences": 1, "Local Transport": 3},
    "Operations": {"Local Transport": 5, "Office Supplies": 2, "Travel": 2, "Accommodation": 1, "Meals": 4},
    "Customer Success": {"Meals": 4, "Travel": 2, "Accommodation": 1, "Telecom & Internet": 2,
                         "Client Entertainment": 1, "Local Transport": 4},
}
BASE = {"Meals": 650, "Travel": 4800, "Accommodation": 4200, "Local Transport": 380,
        "Software Subscription": 6000, "Office Supplies": 1400, "Client Entertainment": 3200,
        "Training & Conferences": 5000, "Telecom & Internet": 999}
MERCH = {
    "Meals": ["Swiggy", "Zomato", "Saravana Bhavan", "Chai Point", "Haldiram's", "Third Wave Coffee"],
    "Travel": ["IndiGo", "Air India", "MakeMyTrip", "IRCTC", "Vistara"],
    "Accommodation": ["Taj Hotels", "Lemon Tree Hotels", "ITC Hotels", "Treebo", "OYO Townhouse"],
    "Local Transport": ["Uber India", "Ola Cabs", "Rapido", "Namma Metro"],
    "Software Subscription": ["Zoho Corporation", "Atlassian", "Freshworks", "Figma", "GitHub", "Notion Labs"],
    "Office Supplies": ["Amazon", "Flipkart", "Staples India", "Croma"],
    "Client Entertainment": ["The Leela Palace", "Toit Brewpub", "Mainland China", "Barbeque Nation"],
    "Training & Conferences": ["Udemy Business", "Coursera", "NASSCOM", "upGrad", "Great Learning"],
    "Telecom & Internet": ["Airtel", "Jio", "ACT Fibernet", "Vodafone Idea"],
}
PURPOSE = {
    "Meals": ["Working lunch with team", "Dinner during client visit", "Team lunch – sprint review"],
    "Travel": ["Client visit", "Quarterly business review", "Site visit – Pune office"],
    "Accommodation": ["Hotel stay for client visit", "Stay for vendor audit"],
    "Local Transport": ["Cab to client office", "Airport transfer", "Office commute – late shift"],
    "Software Subscription": ["Monthly seat licence", "Annual plan renewal", "Team workspace upgrade"],
    "Office Supplies": ["Keyboard and mouse", "Printer cartridges", "Notebooks and stationery"],
    "Client Entertainment": ["Dinner with client stakeholders", "Client lunch – renewal discussion"],
    "Training & Conferences": ["Online course – cloud architecture", "Certification exam fee", "Workshop ticket"],
    "Telecom & Internet": ["Monthly mobile bill", "Home broadband – remote work"],
}
CITIES = ["Bengaluru", "Chennai", "Mumbai", "Pune", "Hyderabad", "New Delhi", "Kochi"]
PAY = ["Corporate card", "Corporate card", "Personal card", "UPI", "Cash"]

emps = []
for d, names in DEPTS.items():
    for name in names:
        emps.append({"id": f"E{1001 + len(emps)}", "name": name, "dept": d, "city": random.choice(CITIES),
                     "mult": {c: math.exp(random.gauss(0, 0.15)) for c in BASE}})
EMP = {e["name"]: e for e in emps}

rows, labels = [], {}
seq = [240000]


def next_id():
    seq[0] += random.randint(1, 3)
    return f"TXN-{seq[0]}"


def rand_date(cat):
    while True:
        d = START + timedelta(days=random.randrange(DAYS))
        if POL[cat]["weekend_allowed"] or (d.weekday() < 5 and d not in HOLI):
            return d


def add(e, cat, amount, d, *, merchant=None, receipt=True, approval=None, purpose=None, label="normal",
        tid=None, pay=None):
    p = POL[cat]
    if approval is None:
        thr = p["approval_threshold"]
        approval = "approved" if (thr and amount >= thr) or random.random() < 0.85 else "pending"
    row = {"transaction_id": tid or next_id(), "employee_id": e["id"], "employee_name": e["name"],
           "department": e["dept"], "date": d.isoformat(), "amount": f"{amount:.2f}", "currency": "INR",
           "merchant": merchant or random.choice(MERCH.get(cat, ["Amazon"])), "category": cat,
           "payment_method": pay or random.choice(PAY), "location": e["city"],
           "business_purpose": purpose or random.choice(PURPOSE.get(cat, ["Business expense"])),
           "receipt_present": "yes" if receipt else "no",
           "receipt_id": f"RCP-{random.randint(100000, 999999)}" if receipt else "",
           "policy_limit": "" if p["max_amount"] is None else str(p["max_amount"]), "approval_status": approval}
    rows.append(row)
    labels[row["transaction_id"]] = label
    return row


def normal_amount(e, cat):
    lim = POL[cat]["max_amount"]
    for _ in range(50):
        a = BASE[cat] * e["mult"][cat] * math.exp(random.gauss(0, 0.22))
        a = round(a, -1) if a > 1000 else round(a)
        if a <= 0.8 * lim:
            return a
    return round(0.7 * lim)


def is_near_dup(e, cat, merchant, amount, d):
    return any(r["employee_id"] == e["id"] and r["merchant"] == merchant and
               abs((date.fromisoformat(r["date"]) - d).days) <= 3 and
               abs(float(r["amount"]) - amount) / max(float(r["amount"]), amount) <= 0.02 for r in rows)


# --- normal activity ------------------------------------------------------
for e in emps:
    cats = MIX[e["dept"]]
    for _ in range(random.randint(20, 27)):
        cat = random.choices(list(cats), weights=list(cats.values()))[0]
        d, amt, m = rand_date(cat), normal_amount(e, cat), random.choice(MERCH[cat])
        if is_near_dup(e, cat, m, amt, d):
            continue
        receipt = not (cat == "Local Transport" and random.random() < 0.4)
        add(e, cat, amt, d, merchant=m, receipt=receipt)

# history for scenario employees (≥ 6 comparable expenses)
for name, cat, base in [("Ananya Iyer", "Training & Conferences", 5000), ("Karthik Subramanian", "Training & Conferences", 4900),
                        ("Priya Raman", "Travel", 4800), ("Arjun Nair", "Software Subscription", 6100)]:
    for k in range(7):
        a = round(base * math.exp(random.gauss(0, 0.12)), -1)
        add(EMP[name], cat, a, START + timedelta(days=4 + k * 13), approval="approved")


def emp_rows(e, cat):
    return [float(r["amount"]) for r in rows if r["employee_id"] == e["id"] and r["category"] == cat
            and labels[r["transaction_id"]] == "normal"]


def wd(d):
    while d.weekday() >= 5 or d in HOLI:
        d -= timedelta(days=1)
    return d


# --- required scenarios (fixed ids) ---------------------------------------
add(EMP["Priya Raman"], "Travel", 18500, wd(date(2026, 10, 5)), merchant="IndiGo", approval="pending",
    purpose="Client visit – Mumbai", label="policy_violation", tid="TXN-251001", pay="Corporate card")
add(EMP["Rahul Menon"], "Office Supplies", 5400, date(2026, 10, 7), merchant="Amazon", approval="pending",
    purpose="Laptop docking station", label="policy_violation", tid="TXN-251002")
add(EMP["Rahul Menon"], "Office Supplies", 5400, date(2026, 10, 7), merchant="Amazon", approval="pending",
    purpose="Laptop docking station", label="duplicate", tid="TXN-251003")
add(EMP["Karthik Subramanian"], "Training & Conferences", 18500, wd(date(2026, 9, 24)), merchant="Great Learning",
    approval="pending", purpose="Leadership programme fee", label="employee_anomaly", tid="TXN-251004")
add(EMP["Arjun Nair"], "Software Subscription", 32000, wd(date(2026, 9, 16)), merchant="Atlassian",
    approval="pending", purpose="Jira and Confluence annual plan", label="category_anomaly", tid="TXN-251005")
add(EMP["Imran Sheikh"], "Travel", 8500, wd(date(2026, 9, 9)), merchant="Air India", receipt=False,
    approval="approved", purpose="Plant visit – Chennai", label="missing_receipt", tid="TXN-251006")
add(EMP["Ananya Iyer"], "Training & Conferences", 30000, wd(date(2026, 9, 2)), merchant="NASSCOM",
    approval="approved", purpose="Annual conference – NASSCOM Product Conclave", label="unusual_legitimate",
    tid="TXN-251007", pay="Corporate card")

# --- additional planted anomalies -----------------------------------------
pick = random.Random(11)
for cat, lo, hi, m in [("Meals", 3200, 4800, "The Leela Palace"), ("Accommodation", 11000, 14500, "Taj Hotels"),
                       ("Client Entertainment", 8200, 9800, "Toit Brewpub"), ("Telecom & Internet", 4200, 5100, "Airtel"),
                       ("Meals", 3600, 4200, "Barbeque Nation"), ("Accommodation", 12000, 13500, "ITC Hotels")]:
    e = pick.choice([x for x in emps if cat in MIX[x["dept"]]])
    add(e, cat, round(pick.uniform(lo, hi), -1), rand_date(cat), merchant=m, approval="pending", label="policy_violation")

normals = [r for r in rows if labels[r["transaction_id"]] == "normal" and POL[r["category"]]["receipt_required"]]
for r in pick.sample(normals, 5):  # exact duplicates re-submitted
    e = next(x for x in emps if x["id"] == r["employee_id"])
    add(e, r["category"], float(r["amount"]), date.fromisoformat(r["date"]), merchant=r["merchant"],
        approval=r["approval_status"], purpose=r["business_purpose"], label="duplicate")
for r in pick.sample(normals, 3):  # near duplicates, 1 day later, receipt missing
    e = next(x for x in emps if x["id"] == r["employee_id"])
    d = date.fromisoformat(r["date"]) + timedelta(days=1)
    if not POL[r["category"]]["weekend_allowed"]:
        d = wd(d) if wd(d) != date.fromisoformat(r["date"]) else d + timedelta(days=2)
    add(e, r["category"], round(float(r["amount"]) * 1.01), d, merchant=r["merchant"], receipt=False,
        purpose=r["business_purpose"], label="duplicate")

made = 0
for e in pick.sample(emps, len(emps)):  # employee anomalies: ~4× own median, within limit
    for cat in ("Meals", "Local Transport", "Telecom & Internet", "Office Supplies"):
        hist = emp_rows(e, cat)
        if len(hist) >= 6:
            med = sorted(hist)[len(hist) // 2]
            amt = round(4.2 * med, -1)
            if amt <= 0.95 * POL[cat]["max_amount"]:
                add(e, cat, amt, rand_date(cat), label="employee_anomaly")
                made += 1
                break
    if made >= 6:
        break

for cat, lo, hi, m, purpose in [("Software Subscription", 38000, 45000, "Freshworks", "Annual CRM plan"),
                                ("Software Subscription", 36000, 42000, "Zoho Corporation", "Zoho One – team plan"),
                                ("Training & Conferences", 34000, 38000, "upGrad", "Executive data science programme"),
                                ("Office Supplies", 4600, 4900, "Croma", "Monitor for workstation")]:
    e = pick.choice([x for x in emps if cat in MIX[x["dept"]]])
    add(e, cat, round(pick.uniform(lo, hi), -1), rand_date(cat), merchant=m, approval="pending", purpose=purpose,
        label="category_anomaly")

for cat in ["Meals", "Accommodation", "Office Supplies", "Client Entertainment", "Telecom & Internet", "Travel", "Meals"]:
    e = pick.choice([x for x in emps if cat in MIX[x["dept"]]])
    add(e, cat, normal_amount(e, cat), rand_date(cat), receipt=False, label="missing_receipt")

for cat, m, lo, hi, purpose in [("Gambling", "Dream11", 2000, 5000, "Fantasy league entry"),
                                ("Gambling", "Delta Corp Casino", 6000, 9000, "Team outing"),
                                ("Personal Expenses", "Tanishq", 9000, 14000, "Gift"),
                                ("Personal Expenses", "Lifestyle Stores", 3000, 6000, "Clothing")]:
    e = pick.choice(emps)
    add(e, cat, round(pick.uniform(lo, hi), -1), rand_date("Meals"), merchant=m, purpose=purpose, label="restricted")

for name, cat, start in [("Siddharth Rao", "Travel", date(2026, 8, 3)), ("Ravi Shankar", "Travel", date(2026, 9, 14)),
                         ("Kavya Reddy", "Accommodation", date(2026, 8, 24))]:
    lim = POL[cat]["max_amount"]
    for k, f in enumerate((0.98, 0.97, 0.99)):
        add(EMP[name], cat, round(lim * f, -1), start + timedelta(days=k * 2), approval="pending",
            label="threshold_split")

# borderline but normal: close to a limit, within the employee's own range
for e in pick.sample(emps, 30):
    for cat in ("Accommodation", "Travel", "Client Entertainment"):
        hist = emp_rows(e, cat)
        lim = POL[cat]["max_amount"]
        if len(hist) >= 5 and 0.85 * lim <= 1.8 * sorted(hist)[len(hist) // 2]:
            add(e, cat, round(min(0.97 * lim, 1.8 * sorted(hist)[len(hist) // 2]), -1), rand_date(cat))
            break

rows.sort(key=lambda r: (r["date"], r["transaction_id"]))
with open(OUT / "demo_expenses.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader(); w.writerows(rows)
with open(OUT / "labels.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["transaction_id", "label"])
    w.writerows(sorted(labels.items()))
planted = sum(v != "normal" for v in labels.values())
print(f"{len(rows)} rows, {planted} planted anomalies")
