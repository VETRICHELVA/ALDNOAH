"""AI insights for one finding: Claude narrates the evidence; rules provide a no-key fallback.

Detection and scoring never depend on this module. Claude only explains numbers the engine already
produced, and is told never to call anything fraud.
"""
import json
import logging
import os
from collections import Counter

log = logging.getLogger(__name__)
MODEL = "claude-opus-5-5"

QUESTIONS = {
    "policy_limit": "Was this amount pre-approved, and by whom?",
    "restricted_category": "What was the business reason for an expense in a restricted category?",
    "duplicate_exact": "Is this the same purchase submitted twice, or two separate purchases?",
    "duplicate_near": "Are the two similar claims for different purchases? Ask for both receipts.",
    "employee_amount": "Why was this expense larger than the employee's usual spend in this category?",
    "category_amount": "What made this expense larger than typical for the category?",
    "missing_receipt": "Can the employee provide the receipt or an invoice?",
    "missing_approval": "Who approved this, and is there a record of the approval?",
    "threshold_split": "Were these expenses part of a single purchase split across claims?",
    "new_merchant": "What was purchased from this merchant, and why this vendor?",
    "frequency": "Why were so many expenses filed in a short period?",
    "ml_isolation": "Which detail of this expense is unusual for this employee's role?",
    "weekend_holiday": "What business activity took place on this date?",
}
CLEARS = {
    "policy_limit": "Written pre-approval for the amount above the limit",
    "restricted_category": "A documented business reason accepted by finance",
    "duplicate_exact": "Two distinct receipts showing two separate purchases",
    "duplicate_near": "Two distinct receipts showing two separate purchases",
    "employee_amount": "A business purpose that explains the larger amount (e.g. event, group booking)",
    "category_amount": "A business purpose that explains the larger amount (e.g. event, group booking)",
    "missing_receipt": "The receipt or a supplier invoice",
    "missing_approval": "Recorded approval from the required approver",
    "threshold_split": "Evidence the expenses were separate purchases",
    "new_merchant": "Confirmation of the vendor and what was bought",
    "frequency": "An itinerary or schedule explaining the frequency",
    "ml_isolation": "A business purpose consistent with the employee's role",
    "weekend_holiday": "Confirmation of business activity on that date",
}

SYSTEM = """You help a finance reviewer investigate one flagged employee expense.
You are given the detection engine's signals and evidence as JSON. Rules:
- Use only facts present in the JSON. Do not invent receipts, approvals, people or numbers.
- Never call the expense fraud or accuse the employee. A finding means "requires review"; many
  unusual expenses are legitimate. Use language like "potential issue", "unusual", "policy violation".
- State uncertainty plainly when history is thin (low confidence, few prior expenses).
- Use Indian rupee formatting (e.g. ₹1,25,000). Be concise and specific; no filler.
- past_decisions shows how reviewers resolved similar findings before; mention it if it is informative.
Return JSON matching the schema."""

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "2-3 sentences: what is unusual and how serious it looks."},
        "questions": {"type": "array", "items": {"type": "string"},
                      "description": "2-4 specific questions to ask the employee or approver."},
        "would_clear": {"type": "array", "items": {"type": "string"},
                        "description": "1-3 pieces of evidence that would make this legitimate."},
        "suggested_decision": {"type": "string", "enum": ["approve", "reject", "request_evidence", "escalate"]},
        "decision_reason": {"type": "string", "description": "One sentence explaining the suggestion."},
    },
    "required": ["summary", "questions", "would_clear", "suggested_decision", "decision_reason"],
    "additionalProperties": False,
}

# ponytail: per-process cache; on Vercel each cold instance regenerates. Persist on the finding if cost matters.
_cache: dict[tuple, dict] = {}


def past_decisions(detail: dict, resolved: list[dict]) -> dict:
    """Feedback loop: how reviewers resolved earlier findings with the same primary signal."""
    code = detail["signals"][0]["code"] if detail["signals"] else None
    same = [r for r in resolved if r["primary_code"] == code and r["id"] != detail["id"]]
    return {"signal": detail["primary_label"], "total": len(same), "by_status": dict(Counter(r["status"] for r in same))}


def rules_insights(detail: dict, decisions: dict) -> dict:
    sig = detail["signals"]
    codes = [s["code"] for s in sig]
    t = detail["transaction"]
    lead = detail["explanation"].rstrip(".")
    sev = {"high": "High-risk finding", "medium": "Medium-risk finding", "low": "Low-risk finding"}[detail["severity"]]
    summary = f"{sev} ({detail['risk_score']}/100): {lead}."
    if len(sig) > 1:
        summary += f" {len(sig)} signals contributed; the largest is {sig[0]['label'].lower()} (+{sig[0]['points']})."
    if detail.get("confidence_note"):
        summary += " " + detail["confidence_note"]
    hard = {"restricted_category", "duplicate_exact"}
    if hard & set(codes):
        decision, reason = "escalate", "A restricted-category or exact-duplicate signal usually needs a finance decision."
    elif "missing_receipt" in codes:
        decision, reason = "request_evidence", "No receipt was submitted with this expense."
    elif "missing_approval" in codes:
        decision, reason = "request_evidence", "The required approval is not recorded."
    elif t.get("receipt_present") is None:
        decision, reason = "request_evidence", "Receipt information was not included in the import."
    elif detail["severity"] == "low":
        decision, reason = "approve", "Only low-weight signals fired; a quick check of the details should be enough."
    else:
        decision, reason = "request_evidence", "The amount is unusual; a business purpose and receipt should confirm it."
    if decisions["total"] >= 3:
        top, n = Counter(decisions["by_status"]).most_common(1)[0]
        reason += f" Reviewers resolved {n} of {decisions['total']} similar findings as {top}."
    return {"source": "rules", "summary": summary,
            "questions": [QUESTIONS[c] for c in codes if c in QUESTIONS][:4],
            "would_clear": list(dict.fromkeys(CLEARS[c] for c in codes if c in CLEARS))[:3],
            "suggested_decision": decision, "decision_reason": reason, "past_decisions": decisions}


def claude_insights(detail: dict, decisions: dict) -> dict | None:
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return None
    import anthropic
    t, ctx = detail["transaction"], detail["context"]
    facts = {
        "transaction": {k: t.get(k) for k in ("date", "amount", "merchant", "category", "payment_method", "location",
                                              "business_purpose", "receipt_present", "approval_status")}
        | {"employee": t["employee"]["name"], "department": t["employee"]["department"]},
        "risk_score": detail["risk_score"], "severity": detail["severity"], "confidence": detail["confidence"],
        "confidence_note": detail.get("confidence_note"), "engine_explanation": detail["explanation"],
        "signals": [{k: s[k] for k in ("label", "layer", "points", "confidence", "evidence")} for s in detail["signals"]],
        "employee_baseline": ctx["employee_baseline"], "category_benchmark": ctx["category_benchmark"],
        "policy": ctx["policy"], "merchant_history": ctx["merchant_history"],
        "duplicates": [{k: d[k] for k in ("external_id", "date", "amount", "merchant")} for d in ctx["duplicates"]],
        "past_decisions": decisions,
    }
    client = anthropic.Anthropic(timeout=25.0, max_retries=1)
    try:
        r = client.messages.create(
            model=MODEL, max_tokens=4000, system=SYSTEM,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": json.dumps(facts, default=str)}],
        )
    except anthropic.APIError as e:  # rate limits, outages, bad key: the rules fallback still answers
        log.warning("Claude insights unavailable: %s", e)
        return None
    if r.stop_reason != "end_turn":  # refusal or truncation: don't show partial output
        log.warning("Claude insights stopped with %s", r.stop_reason)
        return None
    text = next((b.text for b in r.content if b.type == "text"), "")
    try:
        out = json.loads(text)
    except json.JSONDecodeError:
        return None
    return out | {"source": "claude", "model": MODEL, "past_decisions": decisions}


def insights(detail: dict, resolved: list[dict]) -> dict:
    key = (detail["id"], detail["risk_score"], detail["status"])
    if key not in _cache:
        decisions = past_decisions(detail, resolved)
        _cache[key] = claude_insights(detail, decisions) or rules_insights(detail, decisions)
    return _cache[key]
