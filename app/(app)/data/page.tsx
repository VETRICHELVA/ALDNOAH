"use client";
import { useState } from "react";
import { canManage, useMe } from "@/components/Me";
import { PageHeader, Panel, Region, useApi } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { dateTime, num } from "@/lib/format";
import type { ImportResult } from "@/lib/types";

export default function Data() {
  const me = useMe();
  const history = useApi<ImportResult[]>("/imports");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                <thead><tr><th scope="col">Imported</th><th scope="col">File</th><th scope="col">By</th><th scope="col" className="num">Rows</th><th scope="col" className="num">Valid</th><th scope="col" className="num">Need attention</th><th scope="col"><span className="sr-only">Error report</span></th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{dateTime(r.created_at)}</td><td className="font-mono">{r.filename}</td><td>{r.uploaded_by}</td>
                      <td className="num">{num(r.rows_total)}</td><td className="num">{num(r.rows_valid)}</td>
                      <td className={`num ${r.rows_rejected ? "text-warning" : ""}`}>{num(r.rows_rejected)}</td>
                      <td>{r.rows_rejected > 0 && <a className="link" href={`/api/imports/${r.id}/errors.csv`}>Error report</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Region>
      </Panel>
    </>
  );
}
