// Mirrors sentinel/schemas.py — see docs/api-contract.md
export type Role = "ADMIN" | "FINANCE_MANAGER" | "REVIEWER" | "VIEWER";
export type Severity = "high" | "medium" | "low";
export type FindingStatus =
  | "open" | "in_review" | "evidence_requested" | "escalated"
  | "approved" | "rejected" | "legitimate";
export type ReviewAction =
  | "approve" | "reject" | "mark_legitimate" | "request_evidence" | "assign" | "escalate";
export type Page<T> = { items: T[]; total: number; page: number; page_size: number };

export type User = { id: number; email: string; name: string; role: Role };

export type Signal = {
  code: string; label: string; layer: "rule" | "stats" | "ml";
  points: number; strength: number; confidence: number;
  evidence: Record<string, number | string | null>;
};

export type ExpenseRow = {
  id: number; external_id: string; date: string;
  employee: { id: number; name: string; department: string };
  merchant: string; category: string; amount: number;
  policy_status: "within" | "over_limit" | "restricted" | "missing_receipt";
  finding: null | { id: number; risk_score: number; severity: Severity; primary_label: string; status: FindingStatus };
  review_status: "pending" | "approved" | "rejected";
};

export type Policy = {
  id: number; category: string; max_amount: number | null;
  receipt_required: boolean; approval_threshold: number | null; approver_role: string | null;
  restricted: boolean; weekend_allowed: boolean; active: boolean;
};

export type Expense = ExpenseRow & {
  currency: string; payment_method: string; location: string;
  business_purpose: string; receipt_present: boolean; receipt_id: string | null;
  approval_status: string; import_id: number; policy: Policy | null;
};

export type FindingRow = {
  id: number; transaction: ExpenseRow; risk_score: number; severity: Severity;
  confidence: number; anomaly_types: string[]; primary_label: string; explanation: string;
  status: FindingStatus; assignee: User | null; created_at: string;
};

export type AuditEntry = {
  at: string; user: string; action: string; prev_status: string | null;
  new_status: string | null; comment: string | null;
};

export type FindingDetail = Omit<FindingRow, "transaction"> & {
  transaction: Expense; signals: Signal[]; recommended_action: string;
  confidence_note: string | null;
  context: {
    employee_history: ExpenseRow[];
    employee_baseline: { median: number; mean: number; n: number; category_median: number | null };
    category_benchmark: { median: number; p25: number; p75: number; p90: number; n: number };
    policy: Policy | null;
    duplicates: ExpenseRow[];
    merchant_history: { employee_count: number; company_count: number; company_median: number };
  };
  audit: AuditEntry[];
  queue: { position: number; total: number; prev_id: number | null; next_id: number | null };
};

export type AnalysisSummary = {
  transactions: number; findings: number; high: number; medium: number;
  low: number; auto_cleared_pct: number; duration_ms: number;
};

export type ImportResult = {
  id: number; filename: string; created_at: string; uploaded_by: string;
  rows_total: number; rows_valid: number; rows_rejected: number;
  errors_preview: { row: number; field: string; message: string }[];
  analysis: AnalysisSummary | null;
};

export type Tab = "all" | "needs_review" | "high_risk" | "policy" | "duplicates" | "resolved";

export type Metrics = {
  total_spend: number; total_expenses: number; findings: number; high_risk: number;
  amount_at_risk: number; policy_violations: number; unresolved: number; auto_cleared_pct: number;
};

export type Dashboard = {
  metrics: Metrics; previous: Metrics | null;
  spend_trend: { week: string; spend: number; flagged: number }[];
  top_findings: FindingRow[];
  policy_exceptions: { code: string; label: string; count: number; amount: number }[];
  review_progress: { resolved: number; unresolved: number };
};

export type Analytics = {
  by_department: { department: string; spend: number; expenses: number; findings: number; flagged_amount: number }[];
  by_category: { category: string; spend: number; expenses: number; findings: number; flagged_amount: number }[];
  top_employees: { employee: string; department: string; spend: number; expenses: number; findings: number }[];
  top_vendors: { merchant: string; spend: number; expenses: number; flagged_share: number }[];
  findings_trend: { week: string; opened: number; resolved: number }[];
  signal_mix: { code: string; label: string; count: number }[];
};

export type Report = { columns: string[]; rows: (string | number | null)[][] };

export type Evaluation =
  | { available: false }
  | {
      available?: true; precision: number; recall: number; f1: number; fpr: number;
      top20_precision: number; duplicate_accuracy: number; policy_detection: number;
      reviewer_agreement: number | null; labelled: number;
      by_type: { type: string; planted: number; caught: number }[];
    };

export type Settings = {
  org: { name: string; currency: string; timezone: string };
  risk: { weights: { code: string; label: string; weight: number }[]; thresholds: { high: number; medium: number; low: number } };
  retention_days: number;
};
