# Anomaly Detection & Risk Specification

Anomaly ≠ fraud. Every output is a *signal that deserves review*, never an accusation.

## Signal model

Each detector emits, per transaction, zero or more:

```
Signal { code, label, layer: rule|stats|ml, strength s ∈ [0,1], weight w,
         points = round(w·s), confidence c ∈ [0,1], evidence: dict }
```

## Signals

| code | label | layer | w | condition | strength s | c |
|---|---|---|---|---|---|---|
| `policy_limit` | Policy limit exceeded | rule | 35 | amount > max_amount | min(1, 0.5 + (amount/limit − 1)) | 0.95 |
| `restricted_category` | Restricted category | rule | 40 | policy.restricted | 1 | 0.95 |
| `duplicate_exact` | Exact duplicate | rule | 30 | earlier txn with same employee, merchant key, amount, date | 1 | 0.95 |
| `duplicate_near` | Possible duplicate | rule | 15 | earlier txn same employee + merchant key, \|Δamount\| ≤ 2 %, Δdays ≤ 3 (and not exact) | 1 − Δamt% ·10 − Δdays·0.1, floor 0.5 | 0.75 |
| `employee_amount` | Unusual for this employee | stats | 20 | robust z vs employee-category history > 3.5 (fallback: employee overall), n_prior ≥ 5 | 0.5 + 0.5·clip((z−3.5)/6.5) | hist(n) |
| `category_amount` | Unusual for this category | stats | 15 | amount > Q3 + 3·IQR of category (company-wide), category n ≥ 20 | 0.5 + 0.5·clip((x−fence)/fence) | hist(n) |
| `missing_receipt` | Missing receipt | rule | 20 | policy.receipt_required ∧ ¬receipt_present | 1 | 0.95 |
| `missing_approval` | Approval missing | rule | 10 | amount ≥ approval_threshold ∧ approval_status ≠ approved | 1 | 0.95 |
| `threshold_split` | Possible threshold splitting | stats | 10 | ≥ 2 other txns by employee in category within ±7 days at 85–100 % of limit, this one also 85–100 % | min(1, count/3) | 0.7 |
| `new_merchant` | Unusual merchant | stats | 8 | first txn with merchant for employee ∧ amount > employee p90, n_prior ≥ 5 | 1 | hist(n) |
| `frequency` | Unusual frequency | stats | 8 | employee 7-day count > company p95 of 7-day counts ∧ ≥ 4 | 1 | 0.7 |
| `ml_isolation` | Unusual combination of features | ml | 10 | Isolation Forest score in top 3 % | 0.5 + 0.5·clip((score−p97)/(max−p97)) | 0.6 |
| `weekend_holiday` | Weekend / holiday expense | rule | 5 | Sat/Sun or listed Indian public holiday ∧ ¬policy.weekend_allowed | 1 | 0.9 |

`clip(v) = min(1, max(0, v))`. Robust z = 0.6745·(x − median)/MAD; if MAD = 0 use
z = (x − median)/(1.253·mean_abs_dev); if both 0, use ratio-to-median > 3 as the trigger with z := 3.5·ratio/3.
`hist(n) = 0.5 + 0.4·clip((n − 5)/15)` (n = prior comparable transactions).

Duplicates flag the **later** transaction; its evidence links the earlier one. Ground-truth labels
mark the later one.

### Isolation Forest

`sklearn.ensemble.IsolationForest(n_estimators=200, contamination="auto", random_state=42)` on:
log(amount), employee robust z, category robust z, amount / policy limit, day of week,
employee-merchant frequency, days since employee's previous txn, receipt_present.
Score = −`score_samples`. Evidence: the 3 features with the largest absolute standardized value
for that row ("drivers"), so even the ML signal names its reasons.

Weights are chosen so any single policy rule (missing receipt, restricted category, limit
exceeded) creates at least a Low finding on its own, while soft signals (weekend, frequency,
merchant, ML) only matter in combination.

## Aggregation

```
risk       = min(100, Σ points)
confidence = Σ(points·c) / Σ points                (0 if no signals)
severity   = High ≥ 70 · Medium 40–69 · Low 20–39 · (< 20 → no finding, auto-cleared)
confidence label = High ≥ 0.8 · Medium ≥ 0.6 · Low otherwise
```

Displayed severity marks (never colour alone): ◆ High · ▲ Medium · ● Low.

## Explanation templates

Primary signal = highest points. Interpretation is one sentence built from the top 1–2 signals:

| primary | interpretation template | recommended action |
|---|---|---|
| policy_limit | "₹{amount} exceeds the {category} limit of ₹{limit} by {pct}%." | Check approval history and receipt; reject the excess if not pre-approved. |
| restricted_category | "{category} is a restricted category under company policy." | Confirm with the employee; restricted expenses are normally not reimbursable. |
| duplicate_exact | "Matches {other_id} from {date}: same employee, merchant and amount." | Compare both receipts; reject the duplicate if they are the same purchase. |
| duplicate_near | "Similar to {other_id} ({Δdays} days apart, amounts within {Δpct}%)." | Compare both receipts before approving. |
| employee_amount | "₹{amount} is {ratio}× {employee}'s usual {category} spend (median ₹{median})." | Review business purpose and receipt. |
| category_amount | "₹{amount} is well above the typical {category} expense (median ₹{median})." | Review business purpose and receipt. |
| missing_receipt | "{category} requires a receipt; none was attached." | Request the receipt from the employee. |
| missing_approval | "Amounts above ₹{threshold} need {approver} approval; status is {status}." | Obtain or verify approval. |
| threshold_split | "{count} {category} expenses just under the ₹{limit} limit within 7 days." | Review together as a possible split purchase. |
| new_merchant | "First expense at {merchant} for {employee}, above their usual range." | Verify the merchant and purpose. |
| frequency | "{count} expenses in 7 days; most employees file ≤ {p95}." | Check for repeated or split claims. |
| ml_isolation | "Unusual combination: {driver1}, {driver2}." | Review details; no single rule was broken. |
| weekend_holiday | "Incurred on {weekday/holiday}." | Confirm the business purpose. |

A second clause is appended when a second signal adds ≥ 10 points: "…, and {short label}."
Low confidence appends: "Limited history ({n} prior expenses), so this comparison is less reliable."

## Review → feedback

Each review action writes `review_actions` (who, when, action, prev → new status, comment).
Feedback labels for future tuning: `rejected`, `escalated` → confirmed issue; `legitimate`,
`approved` → not an issue. Stored only; no automatic retraining in MVP.

## Evaluation (`sentinel/eval.py`)

Against `data/labels.csv` (transaction_id → planted anomaly type or `normal`):

- Precision, recall, F1, false-positive rate (finding = predicted positive).
- **Top-20 precision**: fraction of the 20 highest-risk findings that are labelled anomalies.
- Duplicate detection accuracy: planted duplicates caught by a `duplicate_*` signal.
- Policy detection: planted policy violations caught by a rule signal.
- Reviewer agreement (from feedback): confirmed / resolved.

Gate (pytest): top-20 precision ≥ 0.85, recall ≥ 0.80.

Note: "legitimate unusual" seed rows (e.g. scenario 6) are labelled `unusual_legitimate`; they count
as correct if flagged at Low/Medium and are excluded from FPR, because flagging them for a quick
review is the desired behaviour.
