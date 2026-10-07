"use client";
import { useRouter } from "next/navigation";
import { date, money, pct, confidenceLabel } from "@/lib/format";
import type { FindingRow } from "@/lib/types";
import { RiskMark, Status } from "./ui";

export function FindingsTable({ items, query = "", caption, compact = false }: {
  items: FindingRow[]; query?: string; caption: string; compact?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Risk</th>
            <th scope="col">Date</th>
            <th scope="col">Employee</th>
            <th scope="col">Vendor</th>
            {!compact && <th scope="col">Category</th>}
            <th scope="col" className="num">Amount</th>
            <th scope="col">Finding</th>
            {!compact && <th scope="col">Confidence</th>}
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => {
            const href = `/anomalies/${f.id}${query}`;
            return (
              <tr key={f.id} className="clickable" onClick={() => router.push(href)}>
                <td><a href={href} onClick={(e) => e.stopPropagation()}><RiskMark severity={f.severity} score={f.risk_score} /></a></td>
                <td className="whitespace-nowrap">{date(f.transaction.date)}</td>
                <td className="whitespace-nowrap">{f.transaction.employee.name}</td>
                <td>{f.transaction.merchant}</td>
                {!compact && <td>{f.transaction.category}</td>}
                <td className="num">{money(f.transaction.amount)}</td>
                <td>{f.primary_label}{f.anomaly_types.length > 1 && <span className="text-muted"> +{f.anomaly_types.length - 1}</span>}</td>
                {!compact && <td className="whitespace-nowrap">{confidenceLabel(f.confidence)} <span className="text-muted num">{pct(f.confidence)}</span></td>}
                <td className="whitespace-nowrap"><Status status={f.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
