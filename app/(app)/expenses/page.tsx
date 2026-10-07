"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { canManage, canReview, useMe } from "@/components/Me";
import { Pager } from "@/components/Pager";
import { PageHeader, Panel, Region, RiskMark, Skeleton, Status, useApi } from "@/components/ui";
import { post } from "@/lib/api";
import { date, money, qs } from "@/lib/format";
import type { ExpenseRow, Page, Policy } from "@/lib/types";

const POLICY: Record<ExpenseRow["policy_status"], [string, string]> = {
  within: ["Within policy", "text-success"],
  over_limit: ["Over limit", "text-danger"],
  restricted: ["Restricted", "text-danger"],
  missing_receipt: ["Missing receipt", "text-warning"],
};

const COLS = [
  ["date", "Date", "date"], ["employee", "Employee", "employee"], ["merchant", "Vendor", "merchant"], ["category", "Category", null],
  ["amount", "Amount", "amount"], ["policy", "Policy", null], ["risk", "Risk", "risk"], ["anomaly", "Anomaly", null], ["status", "Status", null],
] as const;
type Col = (typeof COLS)[number][0];
const KEYS = ["q", "date_from", "date_to", "category", "status", "severity", "sort", "page"] as const;

function Expenses() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const me = useMe();
  const f = Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? ""])) as Record<(typeof KEYS)[number], string>;
  const sort = f.sort || "-date";
  const filterQs = qs({ ...f, page: null, sort: null });
  const state = useApi<Page<ExpenseRow>>(`/expenses${qs({ ...f, sort })}`);
  const policies = useApi<Policy[]>("/policies");
  const [hidden, setHidden] = useState<Set<Col>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState(f.q);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (patch: Partial<Record<(typeof KEYS)[number], string | null>>) => {
    setSelected(new Set());
    router.push(path + qs({ ...f, page: null, ...patch }));
  };
  const show = (c: Col) => !hidden.has(c);
  const sortBy = (key: string) => set({ sort: sort === `-${key}` ? key : `-${key}` });
  const ariaSort = (key: string | null) => (!key ? undefined : sort === key ? "ascending" : sort === `-${key}` ? "descending" : "none");

  async function bulk(action: "approve" | "reject") {
    const rows = state.data?.items.filter((r) => selected.has(r.id) && r.finding) ?? [];
    if (!rows.length) { setMsg("None of the selected expenses have open findings to decide."); return; }
    let comment: string | undefined;
    if (action === "reject") {
      comment = window.prompt("Reason for rejecting these expenses (recorded in the audit trail):") ?? undefined;
      if (!comment) return;
    }
    const r = await post<{ updated: number; skipped: number }>("/anomalies/bulk-review", { ids: rows.map((x) => x.finding!.id), action, comment })
      .catch((e) => { setMsg(e.detail); return null; });
    if (r) { setMsg(`${r.updated} ${action === "approve" ? "approved" : "rejected"}${r.skipped ? `, ${r.skipped} skipped (already resolved)` : ""}.`); setSelected(new Set()); state.reload(); }
  }

  return (
    <>
      <PageHeader title="Expenses" sub="All imported transactions with policy status and risk."
        actions={canManage(me) && <a className="btn" href={`/api/expenses/export.csv${filterQs}`}>Export CSV</a>} />
      <form className="flex flex-wrap items-end gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); set({ q: search }); }}>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Search
          <input className="input w-60" placeholder="Employee, vendor, ID" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">From
          <input type="date" className="input" value={f.date_from} onChange={(e) => set({ date_from: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">To
          <input type="date" className="input" value={f.date_to} onChange={(e) => set({ date_to: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Category
          <select className="select" value={f.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">All</option>
            {policies.data?.map((p) => <option key={p.id}>{p.category}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Status
          <select className="select" value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option><option value="flagged">Flagged</option><option value="cleared">Auto-cleared</option>
            <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Risk
          <select className="select" value={f.severity} onChange={(e) => set({ severity: e.target.value })}>
            <option value="">All</option><option value="high">◆ High</option><option value="medium">▲ Medium</option><option value="low">● Low</option>
          </select></label>
        <button className="btn">Apply</button>
        <details className="relative ml-auto">
          <summary className="btn list-none">Columns</summary>
          <fieldset className="absolute right-0 mt-1 panel p-3 z-10 w-44 space-y-1 text-[13px]">
            <legend className="sr-only">Visible columns</legend>
            {COLS.map(([key, label]) => (
              <label key={key} className="flex gap-2 items-center">
                <input type="checkbox" checked={show(key)} onChange={() => { const n = new Set(hidden); n.has(key) ? n.delete(key) : n.add(key); setHidden(n); }} />
                {label}
              </label>
            ))}
          </fieldset>
        </details>
      </form>
      {canReview(me) && selected.size > 0 && (
        <div className="flex items-center gap-2 mb-2 text-[13px]">
          <span>{selected.size} selected</span>
          <button className="btn btn-success" onClick={() => bulk("approve")}>Approve findings</button>
          <button className="btn btn-danger" onClick={() => bulk("reject")}>Reject findings</button>
        </div>
      )}
      {msg && <p role="status" className="mb-2 text-[13px]">{msg}</p>}
      <Panel>
        <Region state={state} isEmpty={(d) => d.items.length === 0} empty="No expenses match these filters.">
          {(d) => (
            <>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <caption className="sr-only">Expenses</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-8">
                        <input type="checkbox" aria-label="Select all on this page" checked={d.items.length > 0 && d.items.every((r) => selected.has(r.id))}
                          onChange={(e) => setSelected(e.target.checked ? new Set(d.items.map((r) => r.id)) : new Set())} />
                      </th>
                      {COLS.filter(([k]) => show(k)).map(([key, label, sk]) => (
                        <th key={key} scope="col" aria-sort={ariaSort(sk)} className={key === "amount" ? "num" : ""}>
                          {sk ? <button onClick={() => sortBy(sk)}>{label}{sort === sk ? " ↑" : sort === `-${sk}` ? " ↓" : ""}</button> : label}
                        </th>
                      ))}
                      <th scope="col"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((r) => (
                      <tr key={r.id} className="clickable" onClick={() => router.push(`/expenses/${r.id}`)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`Select ${r.external_id}`} checked={selected.has(r.id)}
                            onChange={() => { const n = new Set(selected); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setSelected(n); }} />
                        </td>
                        {show("date") && <td className="whitespace-nowrap">{date(r.date)}</td>}
                        {show("employee") && <td className="whitespace-nowrap">{r.employee.name}<div className="text-muted text-[12px]">{r.employee.department}</div></td>}
                        {show("merchant") && <td>{r.merchant}</td>}
                        {show("category") && <td>{r.category}</td>}
                        {show("amount") && <td className="num">{money(r.amount)}</td>}
                        {show("policy") && <td className={`whitespace-nowrap ${POLICY[r.policy_status][1]}`}>{POLICY[r.policy_status][0]}</td>}
                        {show("risk") && <td>{r.finding ? <RiskMark severity={r.finding.severity} score={r.finding.risk_score} /> : <span className="text-muted">Cleared</span>}</td>}
                        {show("anomaly") && <td>{r.finding?.primary_label ?? <span className="text-muted">—</span>}</td>}
                        {show("status") && <td className="whitespace-nowrap">{r.finding ? <Status status={r.finding.status} /> : <Status status={r.review_status} />}</td>}
                        <td onClick={(e) => e.stopPropagation()}>
                          {r.finding ? <a className="link whitespace-nowrap" href={`/anomalies/${r.finding.id}?tab=all`}>Investigate</a>
                            : <a className="link" href={`/expenses/${r.id}`}>View</a>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={d.page} pageSize={d.page_size} total={d.total} onPage={(p) => set({ page: String(p) })} />
            </>
          )}
        </Region>
      </Panel>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Skeleton />}><Expenses /></Suspense>;
}
