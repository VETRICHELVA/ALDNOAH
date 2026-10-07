"use client";
import { useState } from "react";
import { canManage, useMe } from "@/components/Me";
import { Field, PageHeader, Panel, Region, useApi } from "@/components/ui";
import { money, num, pct, qs } from "@/lib/format";
import type { Evaluation, Report } from "@/lib/types";

const TYPES = [
  ["spend", "Spend by month and category"], ["policy", "Policy exceptions"], ["anomaly", "Anomaly findings"],
  ["employee", "Employee summary"], ["vendor", "Vendor summary"], ["department", "Department summary"], ["audit", "Audit trail"],
] as const;

export default function Reports() {
  const me = useMe();
  const [type, setType] = useState<string>("anomaly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = qs({ date_from: from, date_to: to });
  const report = useApi<Report>(`/reports/${type}${qs({ date_from: from, date_to: to, format: "json" })}`);
  const evaluation = useApi<Evaluation>("/evaluation");

  return (
    <>
      <PageHeader title="Reports" sub="Exports for finance review, management reporting and audit." />
      <Panel title="Detection quality" className="mb-5">
        <Region state={evaluation} rows={3} isEmpty={(e) => e.available === false}
          empty="Detection quality is measured against labelled demo data. Load the demo dataset to see it.">
          {(e) => e.available === false ? null : (
            <div className="px-4 pb-4 space-y-4">
              <dl className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-4">
                {([
                  ["Top-20 precision", e.top20_precision], ["Precision", e.precision], ["Recall", e.recall], ["F1", e.f1],
                  ["False-positive rate", e.fpr], ["Duplicates caught", e.duplicate_accuracy], ["Policy violations caught", e.policy_detection],
                  ["Reviewer agreement", e.reviewer_agreement],
                ] as [string, number | null][]).map(([k, v]) => (
                  <div key={k}><dt className="label">{k}</dt><dd className="text-[20px] font-semibold num text-left">{v == null ? "—" : pct(v, 1)}</dd></div>
                ))}
              </dl>
              <p className="text-[13px] text-muted">Measured on {num(e.labelled)} labelled transactions. Top-20 precision: of the 20 highest-risk findings, the share that are genuinely worth investigating.</p>
              <table className="tbl max-w-[560px]">
                <caption className="sr-only">Detection by planted anomaly type</caption>
                <thead><tr><th scope="col">Planted type</th><th scope="col" className="num">Planted</th><th scope="col" className="num">Caught</th></tr></thead>
                <tbody>{e.by_type.map((r) => <tr key={r.type}><td>{r.type.replaceAll("_", " ")}</td><td className="num">{r.planted}</td><td className="num">{r.caught}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Region>
      </Panel>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <Field label="Report">
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="From"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {canManage(me) && <a className="btn btn-primary" href={`/api/reports/${type}${qs({ date_from: from, date_to: to, format: "csv" })}`}>Download CSV</a>}
      </div>
      <Panel>
        <Region state={report} isEmpty={(r) => !r.rows.length} empty="No records for this report and period.">
          {(r) => (
            <div className="overflow-x-auto max-h-[640px]">
              <table className="tbl">
                <caption className="sr-only">{TYPES.find(([k]) => k === type)?.[1]}{q}</caption>
                <thead><tr>{r.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={i}>{row.map((v, j) => (
                      <td key={j} className={typeof v === "number" ? "num" : ""}>
                        {typeof v === "number" ? (/amount|spend|limit/i.test(r.columns[j]) ? money(v) : num(v)) : v ?? "—"}
                      </td>
                    ))}</tr>
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
