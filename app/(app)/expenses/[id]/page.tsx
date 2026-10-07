"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AuditList } from "@/components/AuditList";
import { KV, Tally } from "@/components/evidence";
import { PageHeader, Panel, Region, RiskMark, Status, useApi } from "@/components/ui";
import { date, money } from "@/lib/format";
import type { AuditEntry, Expense, FindingDetail } from "@/lib/types";

const POLICY_TEXT = { within: "Within policy", over_limit: "Over the category limit", restricted: "Restricted category", missing_receipt: "Receipt required but missing" };

export default function ExpenseDetail() {
  const { id } = useParams<{ id: string }>();
  const state = useApi<Expense & { finding: FindingDetail | null; audit?: AuditEntry[] }>(`/expenses/${id}`);
  return (
    <Region state={state} rows={10}>
      {(t) => (
        <>
          <PageHeader title={`${money(t.amount)} · ${t.merchant}`}
            sub={<>{date(t.date)} · {t.employee.name} · <span className="font-mono">{t.external_id}</span></>}
            actions={<Link className="btn" href="/expenses">← Expenses</Link>} />
          <div className="grid gap-5 xl:grid-cols-[1fr_360px] items-start">
            <div className="space-y-5">
              <Panel title="Anomaly findings">
                <div className="px-4 pb-4">
                  {t.finding ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-4 items-baseline">
                        <span className="text-[20px]"><RiskMark severity={t.finding.severity} score={t.finding.risk_score} /></span>
                        <Status status={t.finding.status} />
                        <Link className="link" href={`/anomalies/${t.finding.id}?tab=all`}>Open investigation →</Link>
                      </div>
                      <p>{t.finding.explanation}</p>
                      <div className="max-w-[440px]"><Tally signals={t.finding.signals} score={t.finding.risk_score} severity={t.finding.severity} /></div>
                      <p className="text-[13px]"><span className="text-muted">Recommended action:</span> {t.finding.recommended_action}</p>
                    </div>
                  ) : <p className="text-muted">No anomalies detected. This expense scored below the review threshold and was auto-cleared.</p>}
                </div>
              </Panel>
              <Panel title="Policy status">
                <div className="px-4 pb-4">
                  <KV rows={[
                    ["Status", POLICY_TEXT[t.policy_status]],
                    ["Policy", t.policy ? `${t.policy.category}: limit ${money(t.policy.max_amount)}, receipt ${t.policy.receipt_required ? "required" : "not required"}${t.policy.approval_threshold != null ? `, approval above ${money(t.policy.approval_threshold)}` : ""}` : "No policy for this category"],
                  ]} />
                </div>
              </Panel>
              <Panel title="Review history & audit trail">
                <div className="px-4 pb-4"><AuditList entries={t.audit ?? t.finding?.audit ?? []} /></div>
              </Panel>
            </div>
            <aside className="space-y-5">
              <Panel title="Transaction">
                <div className="px-4 pb-4">
                  <KV rows={[
                    ["Amount", `${money(t.amount)} ${t.currency}`], ["Date", date(t.date)], ["Employee", t.employee.name],
                    ["Department", t.employee.department], ["Vendor", t.merchant], ["Category", t.category],
                    ["Payment", t.payment_method || "—"], ["Location", t.location || "—"], ["Purpose", t.business_purpose || "—"],
                    ["Approval", t.approval_status || "—"], ["Review", <Status key="s" status={t.review_status} />],
                  ]} />
                </div>
              </Panel>
              <Panel title="Receipt">
                <div className="px-4 pb-4">
                  {t.receipt_present ? (
                    <KV rows={[["Status", <span key="s" className="text-success">✓ Attached</span>], ["Receipt ID", <span key="r" className="font-mono">{t.receipt_id ?? "—"}</span>],
                      ["Extracted vendor", t.merchant], ["Extracted amount", money(t.amount)], ["Extracted date", date(t.date)]]} />
                  ) : <p className="text-danger">✕ Missing</p>}
                </div>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </Region>
  );
}
