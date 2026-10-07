"use client";
import { useState } from "react";
import { canManage, useMe } from "@/components/Me";
import { PageHeader, Panel, Region, useApi } from "@/components/ui";
import { ApiError, post, put } from "@/lib/api";
import { money } from "@/lib/format";
import type { AnalysisSummary, Policy } from "@/lib/types";

type Draft = Omit<Policy, "id">;
const EMPTY: Draft = { category: "", max_amount: null, receipt_required: true, approval_threshold: null, approver_role: "Manager", restricted: false, weekend_allowed: true, active: true };

export default function Policies() {
  const me = useMe();
  const state = useApi<Policy[]>("/policies");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AnalysisSummary | null>(null);
  const [running, setRunning] = useState(false);
  const manage = canManage(me);

  function edit(p: Policy | null) {
    setError(null);
    setEditing(p ? p.id : "new");
    setDraft(p ? { ...p } : EMPTY);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.category.trim()) return setError("Category name is required.");
    try {
      if (editing === "new") await post("/policies", draft); else await put(`/policies/${editing}`, draft);
      setEditing(null);
      state.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not save the policy.");
    }
  }
  async function rerun() {
    setRunning(true);
    try { setRun(await post<AnalysisSummary>("/analysis/run")); } catch (err) { setError(err instanceof ApiError ? err.detail : "Analysis failed."); }
    setRunning(false);
  }
  const numIn = (k: "max_amount" | "approval_threshold") => (
    <input type="number" min={0} className="input w-28" value={draft[k] ?? ""} aria-label={k === "max_amount" ? "Maximum amount" : "Approval threshold"}
      onChange={(e) => setDraft({ ...draft, [k]: e.target.value === "" ? null : Number(e.target.value) })} />
  );
  const chk = (k: "receipt_required" | "restricted" | "weekend_allowed", label: string) => (
    <input type="checkbox" aria-label={label} checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} />
  );

  return (
    <>
      <PageHeader title="Policies" sub="Category rules the detection engine enforces. Changes apply on the next analysis run."
        actions={manage && <>
          <button className="btn" onClick={() => edit(null)}>Add policy</button>
          <button className="btn btn-primary" onClick={rerun} disabled={running}>{running ? "Running analysis…" : "Re-run analysis"}</button>
        </>} />
      {run && (
        <p role="status" className="panel px-4 py-3 mb-4 text-[13px]">
          Analysis complete: {run.transactions} expenses, {run.findings} findings (◆ {run.high} · ▲ {run.medium} · ● {run.low}), {run.auto_cleared_pct.toFixed(1)}% auto-cleared, {run.duration_ms} ms. Resolved findings were not changed.
        </p>
      )}
      {error && <p role="alert" className="text-danger mb-3 text-[13px]">{error}</p>}
      <Panel>
        <Region state={state} isEmpty={(d) => !d.length} empty="No policies configured.">
          {(rows) => (
            <form onSubmit={save} className="overflow-x-auto">
              <table className="tbl">
                <caption className="sr-only">Expense policies by category</caption>
                <thead><tr>
                  <th scope="col">Category</th><th scope="col" className="num">Max amount</th><th scope="col">Receipt</th>
                  <th scope="col" className="num">Approval above</th><th scope="col">Approver</th><th scope="col">Restricted</th>
                  <th scope="col">Weekend allowed</th><th scope="col"><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>
                  {editing === "new" && (
                    <tr>
                      <td><input className="input w-44" aria-label="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></td>
                      <td className="num">{numIn("max_amount")}</td><td>{chk("receipt_required", "Receipt required")}</td>
                      <td className="num">{numIn("approval_threshold")}</td>
                      <td><input className="input w-32" aria-label="Approver" value={draft.approver_role ?? ""} onChange={(e) => setDraft({ ...draft, approver_role: e.target.value || null })} /></td>
                      <td>{chk("restricted", "Restricted")}</td><td>{chk("weekend_allowed", "Weekend allowed")}</td>
                      <td className="whitespace-nowrap"><button className="btn btn-primary">Save</button> <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button></td>
                    </tr>
                  )}
                  {rows.map((p) => editing === p.id ? (
                    <tr key={p.id}>
                      <td className="font-medium">{p.category}</td>
                      <td className="num">{numIn("max_amount")}</td><td>{chk("receipt_required", "Receipt required")}</td>
                      <td className="num">{numIn("approval_threshold")}</td>
                      <td><input className="input w-32" aria-label="Approver" value={draft.approver_role ?? ""} onChange={(e) => setDraft({ ...draft, approver_role: e.target.value || null })} /></td>
                      <td>{chk("restricted", "Restricted")}</td><td>{chk("weekend_allowed", "Weekend allowed")}</td>
                      <td className="whitespace-nowrap"><button className="btn btn-primary">Save</button> <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button></td>
                    </tr>
                  ) : (
                    <tr key={p.id}>
                      <td className="font-medium">{p.category}</td>
                      <td className="num">{p.max_amount != null ? money(p.max_amount) : "—"}</td>
                      <td>{p.receipt_required ? "Required" : "Not required"}</td>
                      <td className="num">{p.approval_threshold != null ? money(p.approval_threshold) : "—"}</td>
                      <td>{p.approver_role ?? "—"}</td>
                      <td>{p.restricted ? <span className="text-danger">Restricted</span> : "No"}</td>
                      <td>{p.weekend_allowed ? "Yes" : "No"}</td>
                      <td>{manage && <button type="button" className="btn btn-quiet link" onClick={() => edit(p)}>Edit</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </form>
          )}
        </Region>
      </Panel>
    </>
  );
}
