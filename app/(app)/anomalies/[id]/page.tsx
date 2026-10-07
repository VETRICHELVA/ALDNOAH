"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AuditList } from "@/components/AuditList";
import { AmountRuler, KV, Tally } from "@/components/evidence";
import { InsightsPanel } from "@/components/insights";
import { canReview, useMe } from "@/components/Me";
import { Panel, Region, Skeleton, Status, useApi } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { confidenceLabel, date, money, num, SEV } from "@/lib/format";
import type { FindingDetail, ReviewAction, User } from "@/lib/types";

const DONE: Record<ReviewAction, string> = {
  approve: "Expense approved.", reject: "Expense rejected.", mark_legitimate: "Marked legitimate.",
  request_evidence: "Evidence requested from the employee.", assign: "Finding assigned.", escalate: "Finding escalated.",
};
const NEEDS_COMMENT: ReviewAction[] = ["reject", "mark_legitimate", "escalate"];
const RESOLVED = ["approved", "rejected", "legitimate"];

function Investigation() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const query = sp.toString() ? `?${sp.toString()}` : "";
  const state = useApi<FindingDetail>(`/anomalies/${id}${query}`);
  return (
    <Region state={state} rows={12}>
      {(f) => <Detail f={f} query={query} onChange={state.reload} />}
    </Region>
  );
}

function Detail({ f, query, onChange }: { f: FindingDetail; query: string; onChange: () => void }) {
  const router = useRouter();
  const me = useMe();
  const t = f.transaction;
  const ctx = f.context;
  const sev = SEV[f.severity];
  const go = (target: number | null) => target && router.push(`/anomalies/${target}${query}`);
  const back = `/anomalies${query}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") go(f.queue.next_id);
      if (e.key === "k") go(f.queue.prev_id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      <nav aria-label="Queue navigation" className="flex flex-wrap items-center gap-3 mb-4 text-[13px]">
        <Link href={back} className="link">← Review queue</Link>
        {f.queue.total > 0 && <span className="text-muted num">{num(f.queue.position)} of {num(f.queue.total)}</span>}
        <span className="flex gap-1">
          <button className="btn" disabled={!f.queue.prev_id} onClick={() => go(f.queue.prev_id)} aria-keyshortcuts="k">‹ Previous</button>
          <button className="btn" disabled={!f.queue.next_id} onClick={() => go(f.queue.next_id)} aria-keyshortcuts="j">Next ›</button>
        </span>
        <span className="text-muted hidden md:inline">J / K to move · A R L E to decide</span>
      </nav>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px] items-start">
        <div className="space-y-5 min-w-0">
          <section className="panel p-5" aria-labelledby="verdict">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 id="verdict" className={`text-[28px] font-semibold num text-left ${sev.cls}`}>
                <span aria-hidden>{sev.mark}</span> {sev.label} risk · {f.risk_score}<span className="text-[16px] text-muted">/100</span>
              </h1>
              <span className="text-[13px]">Confidence: <strong>{confidenceLabel(f.confidence)}</strong> <span className="text-muted num">({f.confidence.toFixed(2)})</span></span>
              <span className="text-[13px]"><Status status={f.status} /></span>
            </div>
            <p className="mt-2 text-[16px] max-w-[70ch]">{f.explanation}</p>
            {f.confidence_note && <p className="mt-1 text-[13px] text-warning">{f.confidence_note}</p>}
          </section>

          <InsightsPanel findingId={f.id} status={f.status} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Why flagged">
              <div className="px-4 pb-4"><Tally signals={f.signals} score={f.risk_score} severity={f.severity} /></div>
            </Panel>
            <Panel title="Recommended action">
              <p className="px-4 pb-4">{f.recommended_action}</p>
            </Panel>
          </div>

          <Panel title="How unusual is the amount?">
            <div className="px-4 pb-3">
              <AmountRuler current={t.amount}
                employeeMedian={ctx.employee_baseline.category_median ?? ctx.employee_baseline.median}
                categoryMedian={ctx.category_benchmark.median}
                limit={ctx.policy?.max_amount} />
              {ctx.employee_baseline.median > 0 && (
                <p className="text-[13px] text-muted">
                  {(t.amount / (ctx.employee_baseline.category_median ?? ctx.employee_baseline.median)).toFixed(2)}× this employee&apos;s usual
                  {ctx.employee_baseline.category_median ? ` ${t.category}` : ""} spend, based on {num(ctx.employee_baseline.n)} prior expenses.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Evidence by signal">
            <ul className="divide-y divide-border">
              {[...f.signals].sort((a, b) => b.points - a.points).map((s) => (
                <li key={s.code} className="px-4 py-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{s.label}</span>
                    <span className="text-muted text-[13px] font-mono">+{s.points} · conf {s.confidence.toFixed(2)} · {s.layer}</span>
                  </div>
                  <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                    {Object.entries(s.evidence).map(([k, v]) => (
                      <div key={k}><dt className="inline text-muted">{k.replaceAll("_", " ")}: </dt>
                        <dd className="inline num">{typeof v === "number" && /amount|median|mean|limit|current|threshold|fence|p\d+/.test(k) ? money(v) : String(v ?? "—")}</dd></div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Policy comparison">
              <div className="px-4 pb-4">
                {ctx.policy ? (
                  <KV rows={[
                    ["Category", ctx.policy.category],
                    ["Limit", ctx.policy.max_amount != null ? `${money(ctx.policy.max_amount)} · this expense ${money(t.amount)}` : "No limit"],
                    ["Receipt", ctx.policy.receipt_required ? (t.receipt_present ? "Required · attached" : t.receipt_present === null ? "Required · not in import" : "Required · missing") : "Not required"],
                    ["Approval", ctx.policy.approval_threshold != null ? `${ctx.policy.approver_role ?? "Manager"} above ${money(ctx.policy.approval_threshold)} · status ${t.approval_status}` : "Not required"],
                    ["Restricted", ctx.policy.restricted ? "Yes — not normally reimbursable" : "No"],
                  ]} />
                ) : <p className="text-muted">No policy configured for {t.category}.</p>}
              </div>
            </Panel>
            <Panel title="Category benchmark">
              <div className="px-4 pb-4">
                <KV rows={[
                  ["Median", money(ctx.category_benchmark.median)],
                  ["Middle 50%", `${money(ctx.category_benchmark.p25)} – ${money(ctx.category_benchmark.p75)}`],
                  ["90th percentile", money(ctx.category_benchmark.p90)],
                  ["Based on", `${num(ctx.category_benchmark.n)} ${t.category} expenses`],
                  ["Merchant", `${num(ctx.merchant_history.employee_count)} prior by this employee · ${num(ctx.merchant_history.company_count)} company-wide · median ${money(ctx.merchant_history.company_median)}`],
                ]} />
              </div>
            </Panel>
          </div>

          {ctx.duplicates.length > 0 && (
            <Panel title="Possible duplicate of">
              <table className="tbl">
                <caption className="sr-only">This expense compared with possible duplicates</caption>
                <thead><tr><th scope="col">ID</th><th scope="col">Date</th><th scope="col">Vendor</th><th scope="col" className="num">Amount</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  <tr className="font-medium"><td className="font-mono">{t.external_id} (this)</td><td>{date(t.date)}</td><td>{t.merchant}</td><td className="num">{money(t.amount)}</td><td>—</td></tr>
                  {ctx.duplicates.map((d) => (
                    <tr key={d.id}><td className="font-mono"><Link className="link" href={`/expenses/${d.id}`}>{d.external_id}</Link></td><td>{date(d.date)}</td><td>{d.merchant}</td><td className="num">{money(d.amount)}</td><td>{d.review_status}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel title={`${t.employee.name}'s recent expenses`}>
            {ctx.employee_history.length ? (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <caption className="sr-only">Last 10 expenses by this employee</caption>
                  <thead><tr><th scope="col">Date</th><th scope="col">Vendor</th><th scope="col">Category</th><th scope="col" className="num">Amount</th><th scope="col">Flag</th></tr></thead>
                  <tbody>
                    {ctx.employee_history.map((h) => (
                      <tr key={h.id} className={h.id === t.id ? "font-medium" : ""}>
                        <td className="whitespace-nowrap">{date(h.date)}</td><td>{h.merchant}</td><td>{h.category}</td>
                        <td className="num">{money(h.amount)}</td>
                        <td>{h.finding ? <span className={SEV[h.finding.severity].cls}>{SEV[h.finding.severity].mark} {h.finding.risk_score}</span> : <span className="text-muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 pb-4 text-muted">No prior expenses for this employee.</p>}
            <p className="px-4 py-2 text-[13px] text-muted border-t border-border">
              Baseline: median {money(ctx.employee_baseline.median)} · mean {money(ctx.employee_baseline.mean)} · {num(ctx.employee_baseline.n)} expenses
            </p>
          </Panel>

          <Panel title="Audit trail"><div className="px-4 pb-4"><AuditList entries={f.audit} /></div></Panel>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-20">
          <Panel title="Transaction">
            <div className="px-4 pb-4">
              <div className="text-[22px] font-semibold num text-left">{money(t.amount)}</div>
              <div className="text-muted text-[13px] mb-3">{date(t.date)} · <span className="font-mono">{t.external_id}</span></div>
              <KV rows={[
                ["Employee", <Link key="e" className="link" href={`/expenses?q=${encodeURIComponent(t.employee.name)}`}>{t.employee.name}</Link>],
                ["Department", t.employee.department],
                ["Vendor", t.merchant],
                ["Category", t.category],
                ["Payment", t.payment_method || "—"],
                ["Location", t.location || "—"],
                ["Purpose", t.business_purpose || <span className="text-warning">Not provided</span>],
                ["Approval", t.approval_status || "—"],
              ]} />
            </div>
          </Panel>
          <Panel title="Receipt">
            <div className="px-4 pb-4 text-[13px]">
              {t.receipt_present ? (
                <KV rows={[["Status", <span key="s" className="text-success">✓ Attached</span>], ["Receipt ID", <span key="r" className="font-mono">{t.receipt_id ?? "—"}</span>],
                  ["Vendor", t.merchant], ["Amount", money(t.amount)], ["Date", date(t.date)]]} />
              ) : t.receipt_present === null ? <p className="text-muted">? Unknown — the import did not include receipt information.</p> : <p className="text-danger">✕ Missing — no receipt was submitted with this expense.</p>}
              <p className="text-muted mt-2">Receipt images are not stored in this version; details come from the imported record.</p>
            </div>
          </Panel>
          {canReview(me) && !RESOLVED.includes(f.status) && (
            <Decision f={f} onDone={onChange} next={() => go(f.queue.next_id)} />
          )}
          {RESOLVED.includes(f.status) && (
            <Panel title="Decision">
              <p className="px-4 pb-4 text-[13px]">Resolved: <Status status={f.status} />.{" "}
                {f.queue.next_id && <button className="link" onClick={() => go(f.queue.next_id)}>Next anomaly →</button>}</p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function Decision({ f, onDone, next }: { f: FindingDetail; onDone: () => void; next: () => void }) {
  const users = useApi<User[]>("/users");
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  async function act(action: ReviewAction) {
    setError(null);
    if (NEEDS_COMMENT.includes(action) && !comment.trim()) {
      setError("Add a comment explaining this decision. It is recorded in the audit trail.");
      document.getElementById("comment")?.focus();
      return;
    }
    if (action === "assign" && !assignee) {
      setError("Choose a reviewer to assign this finding to.");
      return;
    }
    setBusy(true);
    try {
      await post(`/anomalies/${f.id}/review`, { action, comment: comment.trim() || undefined, assignee_id: assignee ? Number(assignee) : undefined });
      setDone(DONE[action]);
      setComment("");
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "The decision could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { if (done) nextRef.current?.focus(); }, [done]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || e.metaKey || e.ctrlKey || e.altKey || busy) return;
      const map: Record<string, ReviewAction> = { a: "approve", r: "reject", l: "mark_legitimate", e: "request_evidence" };
      if (map[e.key]) { e.preventDefault(); act(map[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Panel title="Decision">
      <div className="px-4 pb-4 space-y-3">
        <div role="status" aria-live="polite">
          {done && (
            <div className="flex items-center justify-between gap-2 border border-success/40 bg-success/5 rounded-md px-3 py-2 text-[13px]">
              <span className="text-success font-medium">{done}</span>
              {f.queue.next_id && <button ref={nextRef} className="btn btn-primary" onClick={next}>Next anomaly →</button>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-success justify-center" disabled={busy} onClick={() => act("approve")} aria-keyshortcuts="a">Approve</button>
          <button className="btn btn-danger justify-center" disabled={busy} onClick={() => act("reject")} aria-keyshortcuts="r">Reject</button>
          <button className="btn justify-center" disabled={busy} onClick={() => act("mark_legitimate")} aria-keyshortcuts="l">Mark legitimate</button>
          <button className="btn justify-center" disabled={busy} onClick={() => act("request_evidence")} aria-keyshortcuts="e">Request evidence</button>
          <button className="btn justify-center col-span-2" disabled={busy} onClick={() => act("escalate")}>Escalate</button>
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="assignee">Assign to</label>
          <select id="assignee" className="select flex-1" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Assign to…</option>
            {users.data?.filter((u) => u.role !== "VIEWER").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="btn" disabled={busy} onClick={() => act("assign")}>Assign</button>
        </div>
        <label className="flex flex-col gap-1 text-[13px]">
          <span>Comment <span className="text-muted">(required to reject, mark legitimate or escalate)</span></span>
          <textarea id="comment" className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
            aria-invalid={!!error} aria-describedby={error ? "decision-error" : undefined} />
        </label>
        {error && <p id="decision-error" role="alert" className="text-danger text-[13px]">{error}</p>}
      </div>
    </Panel>
  );
}

export default function Page() {
  return <Suspense fallback={<Skeleton rows={12} />}><Investigation /></Suspense>;
}
