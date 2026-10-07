"""Layer 1: deterministic policy rules."""
from .features import HOLIDAYS, Ctx, sig


def run(ctx: Ctx) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {i: [] for i in range(ctx.n)}
    seen_exact: dict[tuple, int] = {}
    for i in ctx.order:  # chronological: duplicates flag the later transaction
        t, p = ctx.t[i], ctx.policy(i)
        s = out[i]
        amt, lim = t["amount"], p.get("max_amount")
        if p.get("restricted"):
            s.append(sig("restricted_category", 1, 0.95, category=t["category"]))
        if lim and amt > lim:
            s.append(sig("policy_limit", min(1, 0.5 + (amt / lim - 1)), 0.95, current=amt, limit=lim,
                         over_pct=round((amt / lim - 1) * 100, 1), category=t["category"]))
        if p.get("receipt_required") and not t["receipt_present"]:
            s.append(sig("missing_receipt", 1, 0.95, category=t["category"]))
        thr = p.get("approval_threshold")
        if thr and amt >= thr and t["approval_status"] != "approved":
            s.append(sig("missing_approval", 1, 0.95, threshold=thr,
                         approver=p.get("approver_role") or "Manager", status=t["approval_status"]))
        d = t["date"]
        if not p.get("weekend_allowed", True) and (d.weekday() >= 5 or d in HOLIDAYS):
            s.append(sig("weekend_holiday", 1, 0.9, day=HOLIDAYS.get(d, d.strftime("%A"))))

        key = (t["employee_id"], t["merchant_key"], round(amt, 2), d)
        if key in seen_exact:
            j = seen_exact[key]
            s.append(sig("duplicate_exact", 1, 0.95, duplicate_of=ctx.t[j]["external_id"],
                          duplicate_date=ctx.t[j]["date"].isoformat()))
        else:
            seen_exact[key] = i
            # near duplicate: earlier txn, same employee + merchant, within 3 days and 2 %
            for j in ctx.by_emp_merch[(t["employee_id"], t["merchant_key"])]:
                if j == i:
                    break
                days = (d - ctx.t[j]["date"]).days
                diff = abs(amt - ctx.t[j]["amount"]) / max(amt, ctx.t[j]["amount"])
                if 0 <= days <= 3 and diff <= 0.02 and not (days == 0 and diff == 0):
                    strength = max(0.5, 1 - diff * 10 - days * 0.1)
                    s.append(sig("duplicate_near", strength, 0.75, duplicate_of=ctx.t[j]["external_id"],
                                 days_apart=days, amount_diff_pct=round(diff * 100, 1)))
                    break
    return out
