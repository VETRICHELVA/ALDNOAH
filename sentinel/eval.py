"""Detection quality against labelled seed data (see docs/anomaly-spec.md §Evaluation)."""

POLICY_CODES = {"policy_limit", "restricted_category", "missing_receipt", "missing_approval"}


def evaluate(findings: dict[str, dict], labels: dict[str, str]) -> dict:
    """findings: {external_id: {risk_score, severity, anomaly_types}}; labels: {external_id: label}."""
    def caught(tid, label):
        f = findings.get(tid)
        return f is not None and (label != "unusual_legitimate" or f["severity"] != "high")

    pos = [t for t, l in labels.items() if l != "normal"]
    neg = [t for t, l in labels.items() if l == "normal"]
    flagged = [t for t in findings if t in labels]
    tp = sum(caught(t, labels[t]) for t in pos)
    fp = sum(t in findings for t in neg)
    precision = sum(labels[t] != "normal" and caught(t, labels[t]) for t in flagged) / len(flagged) if flagged else 0.0
    recall = tp / len(pos) if pos else 0.0
    top = sorted(flagged, key=lambda t: -findings[t]["risk_score"])[:20]
    types = sorted({l for l in labels.values() if l != "normal"})
    dups = [t for t in pos if labels[t] == "duplicate"]
    pol = [t for t in pos if labels[t] in ("policy_violation", "restricted", "missing_receipt")]
    return {
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0.0,
        "fpr": round(fp / len(neg), 3) if neg else 0.0,
        "top20_precision": round(sum(labels[t] != "normal" for t in top) / len(top), 3) if top else 0.0,
        "duplicate_accuracy": round(sum(any(c.startswith("duplicate") for c in findings.get(t, {}).get("anomaly_types", []))
                                        for t in dups) / len(dups), 3) if dups else 0.0,
        "policy_detection": round(sum(bool(POLICY_CODES & set(findings.get(t, {}).get("anomaly_types", [])))
                                      for t in pol) / len(pol), 3) if pol else 0.0,
        "labelled": len(labels),
        "by_type": [{"type": ty, "planted": sum(labels[t] == ty for t in pos),
                     "caught": sum(labels[t] == ty and caught(t, ty) for t in pos)} for ty in types],
    }
