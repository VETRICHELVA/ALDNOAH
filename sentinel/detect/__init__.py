"""Detection engine: rules -> statistics -> Isolation Forest -> risk -> explanation.

analyze(txns, policies) -> {txn_id: finding} for every transaction scoring >= 20.
"""
from . import ml, rules, stats
from .explain import inr, render
from .features import Ctx
from .risk import LABELS, WEIGHTS, aggregate, confidence_label

__all__ = ["analyze", "inr", "WEIGHTS", "LABELS", "confidence_label"]


def analyze(txns: list[dict], policies: dict[str, dict]) -> dict[int, dict]:
    if not txns:
        return {}
    ctx = Ctx(txns, policies)
    layers = [rules.run(ctx), stats.run(ctx), ml.run(ctx)]
    out = {}
    for i, t in enumerate(txns):
        sigs = sorted((s for layer in layers for s in layer[i] if s["points"] > 0),
                      key=lambda s: -s["points"])
        risk, conf, sev = aggregate(sigs)
        if sev is None:
            continue
        out[t["id"]] = {"risk_score": risk, "severity": sev, "confidence": conf,
                        "anomaly_types": [s["code"] for s in sigs], "primary_label": sigs[0]["label"],
                        "signals": sigs, **render(sigs, t, conf)}
    return out
