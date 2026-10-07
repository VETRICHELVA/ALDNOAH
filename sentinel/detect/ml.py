"""Layer 3: Isolation Forest over behavioural features, with named drivers."""
import numpy as np
from sklearn.ensemble import IsolationForest

from .features import Ctx, clip, sig

FEATURES = ["amount", "amount vs employee baseline", "amount vs category baseline",
            "share of policy limit", "day of week", "merchant familiarity",
            "days since previous expense", "receipt attached"]


def run(ctx: Ctx) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {i: [] for i in range(ctx.n)}
    if ctx.n < 20:
        return out
    X = np.column_stack([
        np.log1p(ctx.amt),
        np.clip(ctx.emp_z, -50, 50),
        np.clip(ctx.cat_z, -50, 50),
        [t["amount"] / (ctx.policy(i).get("max_amount") or t["amount"] or 1) for i, t in enumerate(ctx.t)],
        [t["date"].weekday() for t in ctx.t],
        [len(ctx.by_emp_merch[(t["employee_id"], t["merchant_key"])]) for t in ctx.t],
        ctx.days_prev,
        [float(t["receipt_present"]) for t in ctx.t],
    ])
    score = -IsolationForest(n_estimators=200, contamination="auto", random_state=42).fit(X).score_samples(X)
    p97, top = float(np.percentile(score, 97)), float(score.max())
    Z = (X - X.mean(0)) / np.where(X.std(0) > 0, X.std(0), 1)
    for i in np.where(score > p97)[0]:
        drivers = [f"{FEATURES[k]} {'high' if Z[i, k] > 0 else 'low'}" for k in np.argsort(-np.abs(Z[i]))[:3]]
        strength = 0.5 + 0.5 * clip((score[i] - p97) / (top - p97 or 1))
        out[int(i)].append(sig("ml_isolation", strength, 0.6, score=round(float(score[i]), 3),
                               drivers="; ".join(drivers)))
    return out
