"""Layer 5: deterministic evidence -> interpretation -> recommended action."""


def inr(x) -> str:
    """Indian digit grouping: 125000 -> ₹1,25,000."""
    neg, x = x < 0, abs(float(x))
    whole, frac = f"{x:.2f}".split(".")
    if len(whole) > 3:
        head, parts = whole[:-3], []
        while len(head) > 2:
            parts.insert(0, head[-2:]); head = head[:-2]
        whole = ",".join(([head] if head else []) + parts) + "," + whole[-3:]
    return ("-" if neg else "") + "₹" + whole + ("" if frac == "00" else "." + frac)


def _interp(s: dict, t: dict) -> tuple[str, str]:
    e, c = s["evidence"], s["code"]
    if c == "policy_limit":
        return (f"{inr(e['current'])} exceeds the {e['category']} limit of {inr(e['limit'])} by {e['over_pct']:g}%",
                "Check approval history and receipt; reject the excess if it was not pre-approved.")
    if c == "restricted_category":
        return (f"{e['category']} is a restricted category under company policy",
                "Confirm with the employee; restricted expenses are normally not reimbursable.")
    if c == "duplicate_exact":
        return (f"Matches {e['duplicate_of']} from {e['duplicate_date']}: same employee, merchant and amount",
                "Compare both receipts; reject the duplicate if they are the same purchase.")
    if c == "duplicate_near":
        return (f"Similar to {e['duplicate_of']} ({e['days_apart']} days apart, amounts within {e['amount_diff_pct']:g}%)",
                "Compare both receipts before approving.")
    if c == "employee_amount":
        return (f"{inr(e['current'])} is {e['ratio']:g}× {e['employee']}'s usual {e['category']} spend "
                f"(median {inr(e['employee_median'])})", "Review business purpose and receipt.")
    if c == "category_amount":
        return (f"{inr(e['current'])} is well above the typical {e['category']} expense "
                f"(median {inr(e['category_median'])})", "Review business purpose and receipt.")
    if c == "missing_receipt":
        return f"{e['category']} requires a receipt; none was attached", "Request the receipt from the employee."
    if c == "missing_approval":
        return (f"Amounts above {inr(e['threshold'])} need {e['approver']} approval; status is {e['status']}",
                "Obtain or verify approval.")
    if c == "threshold_split":
        return (f"{e['count']} {e['category']} expenses just under the {inr(e['limit'])} limit within 7 days",
                "Review together as a possible split purchase.")
    if c == "new_merchant":
        return (f"First expense at {e['merchant']} for {e['employee']}, above their usual range",
                "Verify the merchant and purpose.")
    if c == "frequency":
        return (f"{e['count']} expenses in 7 days; most employees file {e['p95']} or fewer",
                "Check for repeated or split claims.")
    if c == "ml_isolation":
        d = e["drivers"].split("; ")
        return f"Unusual combination: {', '.join(d[:2])}", "Review details; no single rule was broken."
    return f"Incurred on {e['day']}", "Confirm the business purpose."


def render(signals: list[dict], t: dict, confidence: float) -> dict:
    top = signals[0]
    text, action = _interp(top, t)
    if len(signals) > 1 and signals[1]["points"] >= 10:
        text += f", and {signals[1]['label'].lower()}"
    text += "."
    hist = [s["evidence"]["n"] for s in signals if s["layer"] == "stats" and "n" in s["evidence"]]
    note = None
    if hist and min(hist) < 10:
        note = f"Limited history ({min(hist)} prior expenses), so this comparison is less reliable."
    elif confidence < 0.6:
        note = "Based mainly on statistical and model signals, which are less certain than policy rules."
    if note and confidence < 0.6:
        text += " " + note
    evidence = {"current": t["amount"]}
    for s in signals:
        for k in ("limit", "employee_median", "category_median", "ratio", "duplicate_of", "threshold"):
            if k in s["evidence"] and k not in evidence:
                evidence[k] = s["evidence"][k]
    return {"explanation": text, "recommended_action": action, "confidence_note": note, "evidence": evidence}
