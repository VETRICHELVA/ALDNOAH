"use client";
import { useState } from "react";
import { canManage, useMe } from "@/components/Me";
import { PageHeader, Panel, Region, useApi } from "@/components/ui";
import { ApiError, del, post } from "@/lib/api";
import { dateTime, num } from "@/lib/format";
import type { ImportResult } from "@/lib/types";

export default function Data() {
  const me = useMe();
  const history = useApi<ImportResult[]>("/imports");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function remove(path: string, question: string, done: (n: number) => string) {
    if (!window.confirm(question)) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const r = await del<{ deleted: number }>(path);
      setResult(null);
      setNotice(done(r.deleted));
      history.reload();
    } catch (err) {
      setError(err instanceof ApiError ? `Nothing was deleted. ${err.detail}` : "Nothing was deleted: the server could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function deleteImport(r: ImportResult) {
    remove(`/imports/${r.id}`,
      `Delete ${r.filename}? This permanently removes its ${num(r.rows_valid)} expenses, their findings and review decisions. Analysis re-runs on the remaining data.`,
      (n) => `Deleted ${r.filename}: ${num(n)} expenses removed. Analysis re-ran on the remaining data.`);
  }

  function deleteAll() {
    remove("/expenses",
      "Delete ALL uploaded expense data? Every expense, finding, review decision and import record will be permanently removed. Users, policies and the audit log are kept.",
      (n) => `All expense data deleted (${num(n)} expenses). Upload a file to start again.`);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a .csv or .xlsx file to upload.");
    if (!/\.(csv|xlsx)$/i.test(file.name)) return setError("Only .csv and .xlsx files can be imported.");
    if (file.size > 4 * 1024 * 1024) return setError("This file is larger than 4 MB. Split it into smaller files and upload each one.");
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      setResult(await post<ImportResult>("/expenses/upload", fd));
      history.reload();
    } catch (err) {
      setError(err instanceof ApiError
        ? `The file could not be imported. ${err.detail}`
        : "The upload did not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Data" sub="Import expense records and check data quality."
        actions={canManage(me) && <a className="btn" href="/api/expenses/export.csv">Export all expenses</a>} />
      {canManage(me) ? (
        <Panel title="Import expenses" className="mb-5">
          <form onSubmit={upload} className="px-4 pb-4 space-y-3">
            <p className="text-[13px] text-muted">CSV or Excel (.xlsx), up to 4 MB. Required columns: transaction_id, employee_id, employee_name, department, date, amount, currency, merchant, category. Analysis runs automatically after import.</p>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="sr-only" htmlFor="file">Expense file</label>
              <input id="file" type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px]" />
              <button className="btn btn-primary" disabled={busy}>{busy ? "Importing and analysing…" : "Upload and analyse"}</button>
            </div>
            {error && <p role="alert" className="text-danger text-[13px]">{error}</p>}
            {notice && <p role="status" className="text-success text-[13px]">{notice}</p>}
            {result && (
              <div role="status" className="border-t border-border pt-3 space-y-2">
                <p className="text-[15px]">
                  <strong className="num">{num(result.rows_total)}</strong> rows detected · <strong className="text-success num">{num(result.rows_valid)}</strong> valid ·{" "}
                  <strong className={result.rows_rejected ? "text-warning num" : "num"}>{num(result.rows_rejected)}</strong> require attention
                </p>
                {result.rows_rejected > 0 && (
                  <>
                    <p className="text-[13px]">{num(result.rows_rejected)} of {num(result.rows_total)} records could not be processed. <a className="link" href={`/api/imports/${result.id}/errors.csv`}>Download error report</a></p>
                    <table className="tbl">
                      <caption className="text-left text-[13px] text-muted py-1">First {result.errors_preview.length} problems</caption>
                      <thead><tr><th scope="col" className="num">Row</th><th scope="col">Field</th><th scope="col">Problem</th></tr></thead>
                      <tbody>{result.errors_preview.map((e, i) => <tr key={i}><td className="num">{e.row}</td><td className="font-mono">{e.field}</td><td>{e.message}</td></tr>)}</tbody>
                    </table>
                  </>
                )}
                {result.analysis && (
                  <p className="text-[13px]">Analysis: {num(result.analysis.findings)} findings across {num(result.analysis.transactions)} expenses (◆ {result.analysis.high} · ▲ {result.analysis.medium} · ● {result.analysis.low}); {result.analysis.auto_cleared_pct.toFixed(1)}% auto-cleared. <a className="link" href="/anomalies">Open review queue →</a></p>
                )}
              </div>
            )}
          </form>
        </Panel>
      ) : <p className="mb-5 text-muted text-[13px]">Your role can view import history but not upload data.</p>}
      <Panel title="Import history">
        <Region state={history} isEmpty={(d) => !d.length} empty="No imports yet.">
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="tbl">
                <caption className="sr-only">Import history</caption>
                <thead><tr><th scope="col">Imported</th><th scope="col">File</th><th scope="col">By</th><th scope="col" className="num">Rows</th><th scope="col" className="num">Valid</th><th scope="col" className="num">Need attention</th><th scope="col"><span className="sr-only">Error report</span></th>{canManage(me) && <th scope="col"><span className="sr-only">Delete</span></th>}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{dateTime(r.created_at)}</td><td className="font-mono">{r.filename}</td><td>{r.uploaded_by}</td>
                      <td className="num">{num(r.rows_total)}</td><td className="num">{num(r.rows_valid)}</td>
                      <td className={`num ${r.rows_rejected ? "text-warning" : ""}`}>{num(r.rows_rejected)}</td>
                      <td>{r.rows_rejected > 0 && <a className="link" href={`/api/imports/${r.id}/errors.csv`}>Error report</a>}</td>
                      {canManage(me) && <td className="text-right"><button type="button" className="btn btn-quiet btn-danger" disabled={busy} onClick={() => deleteImport(r)} aria-label={`Delete import ${r.filename}`}>Delete</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Region>
      </Panel>
      {canManage(me) && (
        <Panel title="Delete data" className="mt-5">
          <div className="px-4 pb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted max-w-2xl">Permanently remove every uploaded expense with its findings, review decisions and import records. Users, policies and the audit log are kept. To remove a single file, use Delete in the import history above.</p>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={deleteAll}>Delete all expense data</button>
          </div>
        </Panel>
      )}
    </>
  );
}
