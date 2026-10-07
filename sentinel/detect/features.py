"""Shared per-transaction context: groupings, robust baselines, rolling counts."""
from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import date

import numpy as np

# code -> (label, weight). Single source of truth for scoring + settings screen.
WEIGHTS = {
    "policy_limit": ("Policy limit exceeded", 35),
    "restricted_category": ("Restricted category", 40),
    "duplicate_exact": ("Exact duplicate", 30),
    "duplicate_near": ("Possible duplicate", 15),
    "employee_amount": ("Unusual for this employee", 20),
    "category_amount": ("Unusual for this category", 15),
    "missing_receipt": ("Missing receipt", 20),
    "missing_approval": ("Approval missing", 10),
    "threshold_split": ("Possible threshold splitting", 20),
    "new_merchant": ("Unusual merchant", 8),
    "frequency": ("Unusual frequency", 8),
    "ml_isolation": ("Unusual combination of features", 10),
    "weekend_holiday": ("Weekend / holiday expense", 5),
}
LAYER = {"employee_amount": "stats", "category_amount": "stats", "threshold_split": "stats",
         "new_merchant": "stats", "frequency": "stats", "ml_isolation": "ml"}

HOLIDAYS = {
    date(2026, 1, 26): "Republic Day", date(2026, 3, 4): "Holi", date(2026, 4, 3): "Good Friday",
    date(2026, 5, 1): "Labour Day", date(2026, 8, 15): "Independence Day",
    date(2026, 8, 28): "Ganesh Chaturthi", date(2026, 10, 2): "Gandhi Jayanti",
    date(2026, 10, 20): "Dussehra", date(2026, 11, 8): "Diwali", date(2026, 12, 25): "Christmas",
}


def clip(v: float) -> float:
    return min(1.0, max(0.0, v))


def hist_conf(n: int) -> float:
    return round(0.5 + 0.4 * clip((n - 5) / 15), 2)


def sig(code: str, strength: float, confidence: float, **evidence) -> dict:
    label, w = WEIGHTS[code]
    return {"code": code, "label": label, "layer": LAYER.get(code, "rule"),
            "points": int(w * strength + 0.5), "strength": round(strength, 3),
            "confidence": confidence, "evidence": evidence}


def robust_z(x: float, others) -> tuple[float, float]:
    """Robust z of x vs others (median/MAD), with the spec's fallbacks. Returns (z, median)."""
    o = np.asarray(others, float)
    med = float(np.median(o))
    mad = float(np.median(np.abs(o - med)))
    if mad > 0:
        return 0.6745 * (x - med) / mad, med
    mean_abs = float(np.mean(np.abs(o - med)))
    if mean_abs > 0:
        return (x - med) / (1.253 * mean_abs), med
    return (3.5 * (x / med) / 3 if med > 0 else 0.0), med


class Ctx:
    def __init__(self, txns: list[dict], policies: dict[str, dict]):
        self.t, self.p, self.n = txns, policies, len(txns)
        self.amt = np.array([t["amount"] for t in txns], float)
        self.order = sorted(range(self.n), key=lambda i: (txns[i]["date"], txns[i]["id"]))
        self.by_emp, self.by_emp_cat = defaultdict(list), defaultdict(list)
        self.by_cat, self.by_emp_merch = defaultdict(list), defaultdict(list)
        for i in self.order:  # chronological within every group
            t = txns[i]
            self.by_emp[t["employee_id"]].append(i)
            self.by_emp_cat[(t["employee_id"], t["category"])].append(i)
            self.by_cat[t["category"]].append(i)
            self.by_emp_merch[(t["employee_id"], t["merchant_key"])].append(i)

        self.cat_stats = {}
        for c, idx in self.by_cat.items():
            a = self.amt[idx]
            q1, med, q3 = np.percentile(a, [25, 50, 75])
            self.cat_stats[c] = {"median": float(med), "q1": float(q1), "q3": float(q3),
                                 "fence": float(q3 + 3 * (q3 - q1)), "n": len(idx)}

        # leave-one-out employee-category baseline
        self.emp_z = np.zeros(self.n); self.emp_med = np.zeros(self.n); self.emp_n = np.zeros(self.n, int)
        self.cat_z = np.zeros(self.n)
        self.week_count = np.zeros(self.n, int); self.days_prev = np.full(self.n, 60.0)
        self.emp_p90 = np.zeros(self.n); self.emp_others_n = np.zeros(self.n, int)
        for i, t in enumerate(txns):
            grp = self.by_emp_cat[(t["employee_id"], t["category"])]
            others = [j for j in grp if j != i]
            self.emp_n[i] = len(others)
            if others:
                z, med = robust_z(self.amt[i], self.amt[others])
                self.emp_z[i], self.emp_med[i] = z, med
            cat_others = [j for j in self.by_cat[t["category"]] if j != i]
            if cat_others:
                self.cat_z[i] = robust_z(self.amt[i], self.amt[cat_others])[0]
            eo = [j for j in self.by_emp[t["employee_id"]] if j != i]
            self.emp_others_n[i] = len(eo)
            if eo:
                self.emp_p90[i] = float(np.percentile(self.amt[eo], 90))

        for e, idx in self.by_emp.items():
            ords = [txns[i]["date"].toordinal() for i in idx]
            for k, i in enumerate(idx):
                d = ords[k]
                self.week_count[i] = bisect_right(ords, d) - bisect_left(ords, d - 6)
                if k:
                    self.days_prev[i] = min(60.0, d - ords[k - 1])
        self.week_p95 = float(np.percentile(self.week_count, 95)) if self.n else 0.0

    def policy(self, i: int) -> dict:
        return self.p.get(self.t[i]["category"], {})
