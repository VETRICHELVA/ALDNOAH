# API Contract

Base path `/api`. JSON unless noted. Auth via `session` httpOnly cookie (JWT).
Errors: `{ "detail": string }` with 400 / 401 / 403 / 404 / 409 / 413 / 422.
Money is a JSON number in INR with 2 decimals. Dates `YYYY-MM-DD`; timestamps ISO 8601 UTC.
Source of truth for shapes: `sentinel/schemas.py` (Pydantic); `lib/types.ts` mirrors it.
FastAPI serves OpenAPI at `/api/docs`.

## Roles

| Capability | VIEWER | REVIEWER | FINANCE_MANAGER | ADMIN |
|---|---|---|---|---|
| Read everything | ✓ | ✓ | ✓ | ✓ |
| Review findings | | ✓ | ✓ | ✓ |
| Upload, run analysis, export, edit policies | | | ✓ | ✓ |
| Manage users | | | | ✓ |

## Shared types

```ts
type Role = "ADMIN" | "FINANCE_MANAGER" | "REVIEWER" | "VIEWER"
type Severity = "high" | "medium" | "low"
type FindingStatus = "open" | "in_review" | "evidence_requested" | "escalated"
                   | "approved" | "rejected" | "legitimate"
type ReviewAction = "approve" | "reject" | "mark_legitimate" | "request_evidence"
                  | "assign" | "escalate"
type Page<T> = { items: T[]; total: number; page: number; page_size: number }

type User = { id: number; email: string; name: string; role: Role }

type Signal = { code: string; label: string; layer: "rule" | "stats" | "ml";
                points: number; strength: number; confidence: number;
                evidence: Record<string, number | string | null> }

type ExpenseRow = { id: number; external_id: string; date: string;
  employee: { id: number; name: string; department: string };
  merchant: string; category: string; amount: number;
  policy_status: "within" | "over_limit" | "restricted" | "missing_receipt";
  finding: null | { id: number; risk_score: number; severity: Severity;
                    primary_label: string; status: FindingStatus };
  review_status: "pending" | "approved" | "rejected" }

type Expense = ExpenseRow & { currency: string; payment_method: string; location: string;
  business_purpose: string; receipt_present: boolean; receipt_id: string | null;
  approval_status: string; import_id: number;
  policy: Policy | null }

type FindingRow = { id: number; transaction: ExpenseRow; risk_score: number; severity: Severity;
  confidence: number; anomaly_types: string[]; primary_label: string; explanation: string;
  status: FindingStatus; assignee: User | null; created_at: string }

type AuditEntry = { at: string; user: string; action: string; prev_status: string | null;
                    new_status: string | null; comment: string | null }

type FindingDetail = FindingRow & {
  transaction: Expense; signals: Signal[]; recommended_action: string;
  confidence_note: string | null;
  context: {
    employee_history: ExpenseRow[];         // last 10, same employee
    employee_baseline: { median: number; mean: number; n: number; category_median: number | null };
    category_benchmark: { median: number; p25: number; p75: number; p90: number; n: number };
    policy: Policy | null;
    duplicates: ExpenseRow[];               // linked earlier transactions
    merchant_history: { employee_count: number; company_count: number; company_median: number };
  };
  audit: AuditEntry[];
  queue: { position: number; total: number; prev_id: number | null; next_id: number | null } }

type Policy = { id: number; category: string; max_amount: number | null;
  receipt_required: boolean; approval_threshold: number | null; approver_role: string | null;
  restricted: boolean; weekend_allowed: boolean; active: boolean }

type ImportResult = { id: number; filename: string; created_at: string; uploaded_by: string;
  rows_total: number; rows_valid: number; rows_rejected: number;
  errors_preview: { row: number; field: string; message: string }[];   // first 20
  analysis: AnalysisSummary | null }

type AnalysisSummary = { transactions: number; findings: number; high: number; medium: number;
  low: number; auto_cleared_pct: number; duration_ms: number }
```

## Endpoints

### Auth
| Method | Path | Body / Query | Response |
|---|---|---|---|
| POST | `/auth/login` | `{email, password}` | `User` + sets cookie. 401 "Email or password is incorrect." |
| POST | `/auth/logout` | – | 204, clears cookie |
| GET | `/auth/me` | – | `User` or 401 |

### Expenses
| Method | Path | Notes |
|---|---|---|
| POST | `/expenses/upload` | multipart `file` (.csv/.xlsx, ≤ 4 MB). → `ImportResult` (analysis runs). 413 too large, 422 unreadable file / missing required columns. FINANCE_MANAGER+ |
| GET | `/expenses` | `q, date_from, date_to, employee_id, department, category, merchant, severity, risk_min, status (pending|approved|rejected|flagged|cleared), page=1, page_size=50 (≤ 200), sort=date|-date|amount|-amount|risk|-risk|employee|merchant` → `Page<ExpenseRow>` |
| GET | `/expenses/export.csv` | same filters → `text/csv`. FINANCE_MANAGER+ |
| GET | `/expenses/{id}` | → `Expense & { finding: FindingDetail \| null }` |

### Analysis
| POST | `/analysis/run` | → `AnalysisSummary`. FINANCE_MANAGER+ |

### Anomalies
| Method | Path | Notes |
|---|---|---|
| GET | `/anomalies` | `tab = all|needs_review|high_risk|policy|duplicates|resolved` (default `needs_review`), plus `q, severity, category, department, assignee_id, page, page_size, sort (default -risk)` → `Page<FindingRow> & { counts: Record<tab, number> }` |
| GET | `/anomalies/{id}` | same query as list (defines `queue` prev/next) → `FindingDetail` |
| POST | `/anomalies/{id}/review` | `{ action: ReviewAction, comment?: string, assignee_id?: number }` → `FindingDetail`. REVIEWER+ |
| POST | `/anomalies/bulk-review` | `{ ids: number[], action: "approve"|"reject", comment?: string }` → `{ updated: number, skipped: number }`. REVIEWER+ |

Tabs: `needs_review` = open, in_review, evidence_requested, escalated · `high_risk` = high ∧ unresolved ·
`policy` = has policy_limit / restricted_category / missing_receipt / missing_approval ·
`duplicates` = has duplicate_* · `resolved` = approved, rejected, legitimate.

Review transitions (409 if finding already resolved; 422 if comment missing where required):

| action | new status | comment | also |
|---|---|---|---|
| approve | approved | optional | txn.review_status = approved, resolved_at/by set |
| reject | rejected | **required** | txn.review_status = rejected, resolved |
| mark_legitimate | legitimate | **required** | txn.review_status = approved, resolved |
| request_evidence | evidence_requested | optional | – |
| assign | in_review | optional | `assignee_id` required (REVIEWER+ user) |
| escalate | escalated | **required** | – |

Every review writes `review_actions` and `audit_logs`.

### Dashboard / analytics / reports
| GET | `/dashboard?date_from&date_to` | `{ metrics: { total_spend, total_expenses, findings, high_risk, amount_at_risk, policy_violations, unresolved, auto_cleared_pct }, previous: same | null, spend_trend: {week, spend, flagged}[], top_findings: FindingRow[5], policy_exceptions: {code, label, count, amount}[], review_progress: {resolved, unresolved} }` |
| GET | `/analytics?date_from&date_to` | `{ by_department: {department, spend, expenses, findings, flagged_amount}[], by_category: {...}[], top_employees: {employee, department, spend, expenses, findings}[], top_vendors: {merchant, spend, expenses, flagged_share}[], findings_trend: {week, opened, resolved}[], signal_mix: {code, label, count}[] }` |
| GET | `/reports/{type}?date_from&date_to&format=json|csv` | type ∈ spend, policy, anomaly, employee, vendor, department, audit. json → `{ columns: string[], rows: (string|number|null)[][] }`; csv → file |
| GET | `/evaluation` | `{ precision, recall, f1, fpr, top20_precision, duplicate_accuracy, policy_detection, reviewer_agreement, labelled: number, by_type: {type, planted, caught}[] } | { available: false }` |

### Policies
| GET | `/policies` | `Policy[]` |
| POST | `/policies` | `Policy` without id → `Policy`. 409 if category exists. FINANCE_MANAGER+ |
| PUT | `/policies/{id}` | `Policy` without id → `Policy`. FINANCE_MANAGER+ |

### Imports
| GET | `/imports` | `ImportResult[]` (newest first) |
| GET | `/imports/{id}/errors.csv` | rejected rows + `error` column |

### Users / settings
| GET | `/users` | `User[]` (REVIEWER+, for assignment) |
| PUT | `/users/{id}` | `{ role }` → `User`. ADMIN |
| GET | `/settings` | `{ org: {name, currency, timezone}, risk: { weights: {code,label,weight}[], thresholds: {high, medium, low} }, retention_days: number }` (read-only in MVP) |

## Import validation

Required columns: `transaction_id, employee_id, employee_name, department, date, amount,
currency, merchant, category`. Optional: `payment_method, location, business_purpose,
receipt_present, receipt_id, policy_limit, approval_status`. Headers are case/space-insensitive.

Row rejected (one row in error report per problem) when:
missing required value · amount not a number, ≤ 0 or > 1,00,00,000 · date unparseable or in the
future (accepts `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-Mon-YYYY`, `07 Oct 2026`, Excel serial) ·
currency ≠ INR ("Only INR is supported in this version") · category not matching a policy
category or alias · `transaction_id` duplicated in file or already imported · boolean not in
yes/no/true/false/1/0/y/n.

Normalization: trim whitespace; amount strips `₹`, `,`, `Rs`; merchant display = trimmed
original, merchant key = lowercase alnum (e.g. "Amazon.in", "AMAZON IN" → `amazonin`); category
mapped to canonical; employee/department upserted by id/name.
