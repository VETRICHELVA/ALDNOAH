"""Layer 2: robust statistical baselines."""
from .features import Ctx, clip, hist_conf, sig


def run(ctx: Ctx) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {i: [] for i in range(ctx.n)}
    for i, t in enumerate(ctx.t):
        s, amt, p = out[i], t["amount"], ctx.policy(i)
        n, z, med = int(ctx.emp_n[i]), float(ctx.emp_z[i]), float(ctx.emp_med[i])
        # ponytail: ratio >= 2 guard added to the spec's z > 3.5 to stop tight spenders flagging on +40 %
        if n >= 5 and z > 3.5 and med > 0 and amt / med >= 2:
            s.append(sig("employee_amount", 0.5 + 0.5 * clip((z - 3.5) / 6.5), hist_conf(n),
                         current=amt, employee_median=round(med, 2), ratio=round(amt / med, 2),
                         n=n, z=round(z, 1), category=t["category"], employee=t["employee_name"]))
        cs = ctx.cat_stats[t["category"]]
        if cs["n"] >= 20 and amt > cs["fence"] > 0:
            s.append(sig("category_amount", 0.5 + 0.5 * clip((amt - cs["fence"]) / cs["fence"]),
                         hist_conf(cs["n"]), current=amt, category_median=round(cs["median"], 2),
                         fence=round(cs["fence"], 2), n=cs["n"], category=t["category"]))
        lim = p.get("max_amount")
        if lim and 0.85 * lim <= amt <= lim:
            near = [j for j in ctx.by_emp_cat[(t["employee_id"], t["category"])]
                    if 0.85 * lim <= ctx.t[j]["amount"] <= lim and abs((ctx.t[j]["date"] - t["date"]).days) <= 7]
            if len(near) >= 3:
                s.append(sig("threshold_split", min(1, len(near) / 3), 0.7, count=len(near), limit=lim,
                             category=t["category"]))
        grp = ctx.by_emp_merch[(t["employee_id"], t["merchant_key"])]
        eo = int(ctx.emp_others_n[i])
        if grp[0] == i and eo >= 5 and amt > ctx.emp_p90[i]:
            s.append(sig("new_merchant", 1, hist_conf(eo), merchant=t["merchant"], employee=t["employee_name"],
                         employee_p90=round(float(ctx.emp_p90[i]), 2)))
        wc = int(ctx.week_count[i])
        if wc >= 4 and wc > ctx.week_p95:
            s.append(sig("frequency", 1, 0.7, count=wc, p95=int(ctx.week_p95)))
    return out
