"use client";
import { Panel, Region, useApi } from "@/components/ui";
import type { Insights } from "@/lib/types";

const DECISION: Record<Insights["suggested_decision"], string> = {
  approve: "Approve", reject: "Reject", request_evidence: "Request evidence", escalate: "Escalate",
};
const STATUS: Record<string, string> = { approved: "approved", rejected: "rejected", legitimate: "marked legitimate" };

/** AI insights for one finding. Refetches when the status changes so past decisions stay current. */
export function InsightsPanel({ findingId, status }: { findingId: number; status: string }) {
  const state = useApi<Insights>(`/anomalies/${findingId}/insights?s=${status}`);
  const source = state.data?.source === "claude"
    ? "Written by Claude from this finding's evidence"
    : state.data ? "Rule-based (AI model not configured)" : "Generating…";
  return (
    <Panel title="AI insights" actions={<span className="text-[12px] text-muted">{source}</span>}>
      <div className="px-4 pb-4" aria-live="polite">
        <Region state={state} rows={3}>
          {(d) => (
            <div className="space-y-3 text-[14px]">
              <p className="max-w-[75ch]">{d.summary}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-[13px] font-semibold mb-1">Questions to ask</h3>
                  <ol className="list-decimal pl-5 space-y-1 text-[13px]">{d.questions.map((q) => <li key={q}>{q}</li>)}</ol>
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold mb-1">Evidence that would clear it</h3>
                  <ul className="list-disc pl-5 space-y-1 text-[13px]">{d.would_clear.map((q) => <li key={q}>{q}</li>)}</ul>
                </div>
              </div>
              <p className="text-[13px] border-t border-border pt-3">
                <span className="font-semibold">Suggested next step: {DECISION[d.suggested_decision]}.</span> {d.decision_reason}
              </p>
              <p className="text-[12px] text-muted">
                {d.past_decisions.total
                  ? <>Past decisions on “{d.past_decisions.signal}” findings: {Object.entries(d.past_decisions.by_status)
                      .map(([s, n]) => `${n} ${STATUS[s] ?? s}`).join(", ")}. </>
                  : <>No earlier “{d.past_decisions.signal}” findings have been resolved yet. </>}
                Suggestions only — the reviewer makes the decision.
              </p>
            </div>
          )}
        </Region>
      </div>
    </Panel>
  );
}
