# Expense Sentinel — Product Spec (MVP)

Status: approved design, 2026-10-07. Context: hackathon / time-boxed demo, deployed to Vercel.

## Problem

Finance reviewers process hundreds to thousands of employee expenses a month. Most are fine.
A few are policy violations, duplicates, unusual amounts or unusual behaviour. Reviewing
everything is slow; rules alone miss behavioural context.

**Central question the product answers:** *Which expenses deserve my attention, why, and what
should I do about them?*

**Value:** turn "review 1,200 transactions" into "review the ~60 findings, starting with the top 20".

## User

Primary and only designed-for persona in MVP: **finance reviewer / finance manager**.
Other roles (admin, viewer) use the same screens with fewer permissions.

## Scope

In:

1. CSV / XLSX import with row-level validation and a downloadable error report.
2. Normalization (amounts, dates, categories, merchants, booleans).
3. Policy configuration per category: max amount, receipt required, approval threshold,
   restricted flag, weekend allowed.
4. Detection: rules → robust statistics → Isolation Forest (see `anomaly-spec.md`).
5. Decomposable risk score (0–100), separate confidence (0–1), severity.
6. Template explanations: signal → evidence → interpretation → recommended action.
7. Anomaly Center queue (tabs, risk-descending) and Investigation screen with decisions:
   approve, reject, mark legitimate, request evidence, assign, escalate.
8. Audit trail + review feedback stored for future tuning.
9. Overview dashboard, Expenses table, Analytics, Reports (CSV export), Policies, Data, Settings.
10. Detection-quality evaluation (precision, recall, F1, FPR, top-20 precision, duplicate accuracy)
    against labelled seed data, shown in Reports.
11. Login with four roles: ADMIN, FINANCE_MANAGER, REVIEWER, VIEWER.

Out (deliberately): LLM layer, receipt image upload/OCR, notifications/email, saved table views,
PDF export, multi-tenancy, bank/ERP/card integrations, model retraining from feedback,
graph/network fraud, mobile app, public marketing page.

## Language rules

The system never says "fraud". It uses: *Potential issue*, *Unusual transaction*,
*Requires review*, *Policy violation*, *High-risk finding*. Anomaly ≠ fraud.

## User stories and acceptance criteria

| # | Story | Accepted when |
|---|---|---|
| U1 | As a reviewer I sign in. | Valid credentials set an httpOnly session cookie and land on Overview; invalid show "Email or password is incorrect." |
| U2 | As a finance manager I upload a CSV/XLSX. | Result shows rows detected / valid / need attention; rejected rows downloadable as CSV with reason per row; analysis runs automatically. |
| U3 | As a finance manager I edit a policy. | Change saved, audit-logged; "Re-run analysis" applies it; resolved findings are not altered. |
| U4 | As a reviewer I see what needs attention in 30 s. | Overview shows 5 metrics, spend trend, top 5 findings, policy exception summary, "Open review queue". |
| U5 | As a reviewer I work the queue. | Anomaly Center defaults to *Needs review*, sorted risk desc; tab counts shown. |
| U6 | As a reviewer I understand a finding in ≤ 20 s. | Investigation shows severity+score, one-sentence interpretation, tally, amount ruler, evidence per signal, recommended action, without leaving the page. |
| U7 | As a reviewer I decide and move on. | Action recorded with prev/new status and comment; confirmation shown; "Next anomaly →" opens next item in the same queue filter. |
| U8 | As a reviewer I mark an unusual-but-valid expense legitimate. | Comment required; finding resolved as *legitimate*; stored as feedback. |
| U9 | As anyone I see history. | Expense Detail and Investigation show audit trail: who, when, action, prev → new status, comment. |
| U10 | As a manager I export. | Expenses table and each report export CSV honoring current filters; cells safe against formula injection. |
| U11 | As a viewer I cannot change anything. | Review/upload/policy endpoints return 403; UI hides action controls. |

## Success metrics (demo)

- Top-20 precision ≥ 0.85 and recall ≥ 0.80 on seeded labelled data (enforced by a test).
- ≤ 6% of transactions become findings ("auto-cleared" ≥ 94%).
- All 6 required scenarios detected; scenario 6 (annual conference) flagged but not High.
- Demo path (import → overview → queue → investigate → decide → dashboard updates) works on the
  Vercel deployment.

## Demo data

~1,200 transactions, 48 employees, 6 departments, Jul–Oct 2026, INR, realistic Indian merchants
and names. Includes normal, borderline, and planted anomalies with a ground-truth `labels.csv`.
Required planted scenarios:

1. Policy violation: Travel limit ₹10,000, actual ₹18,500.
2. Exact duplicate: ₹5,400, 07 Oct, Amazon, same employee, twice.
3. Employee baseline: employee usual ≈ ₹4,900, current ₹18,500.
4. Category anomaly: category median ≈ ₹6,100, current ₹32,000.
5. Missing receipt: ₹8,500, receipt required, none.
6. Legitimate anomaly: usual ≈ ₹5,000, ₹30,000 "Annual conference", receipt + approval valid.

## Definition of Done

Every checkbox in the source brief §33, verified on the deployed app, plus green `pytest` and the
Playwright demo-path test.
