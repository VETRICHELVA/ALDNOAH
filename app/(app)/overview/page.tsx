"use client";
import Link from "next/link";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FindingsTable } from "@/components/FindingsTable";
import { PageHeader, Panel, Region, useApi } from "@/components/ui";
import { date, money, num, pct } from "@/lib/format";
import type { Dashboard, Metrics } from "@/lib/types";

const METRICS: { key: keyof Metrics; label: string; fmt: (n: number) => string; worseWhenUp?: boolean }[] = [
  { key: "total_spend", label: "Total spend", fmt: money },
  { key: "total_expenses", label: "Expenses", fmt: num },
  { key: "findings", label: "Findings", fmt: num, worseWhenUp: true },
  { key: "high_risk", label: "High-risk", fmt: num, worseWhenUp: true },
  { key: "amount_at_risk", label: "Amount at risk", fmt: money, worseWhenUp: true },
  { key: "unresolved", label: "Unresolved", fmt: num, worseWhenUp: true },
  { key: "auto_cleared_pct", label: "Auto-cleared", fmt: (n) => `${n.toFixed(1)}%` },
];

export default function Overview() {
  const state = useApi<Dashboard>("/dashboard");
  return (
    <>
      <PageHeader title="Overview" sub="What happened, what is unusual, and what needs a decision."
        actions={<Link href="/anomalies" className="btn btn-primary">Open review queue</Link>} />
      <Region state={state} rows={10} isEmpty={(d) => d.metrics.total_expenses === 0}
        empty={<>No expenses imported yet. <Link className="link" href="/data">Import expense data</Link> to begin.</>}>
        {(d) => (
          <div className="space-y-5">
            <section aria-label="Key metrics" className="panel grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 divide-x divide-border">
              {METRICS.map((m) => {
                const v = d.metrics[m.key];
                const prev = d.previous?.[m.key];
                const delta = prev != null && prev !== 0 ? (v - prev) / prev : null;
                return (
                  <div key={m.key} className="p-4 border-b xl:border-b-0 border-border">
                    <div className="label">{m.label}</div>
                    <div className="text-[22px] font-semibold num text-left mt-1">{m.fmt(v)}</div>
                    {delta != null && Math.abs(delta) >= 0.005 && (
                      <div className={`text-[12px] ${(delta > 0) === !!m.worseWhenUp ? "text-danger" : "text-success"}`}>
                        {delta > 0 ? "▲" : "▼"} {pct(Math.abs(delta))} vs previous period
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
              <Panel title="Is spend rising, and how much of it is flagged?">
                {d.spend_trend.length ? (
                  <div className="h-[260px] px-2 pb-3">
                    <ResponsiveContainer>
                      <LineChart data={d.spend_trend} margin={{ left: 16, right: 16, top: 8 }}>
                        <CartesianGrid stroke="#eef0f3" vertical={false} />
                        <XAxis dataKey="week" tickFormatter={(w) => date(w).slice(0, 6)} fontSize={11} stroke="#6b7280" />
                        <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} fontSize={11} stroke="#6b7280" width={56} />
                        <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(w) => `Week of ${date(String(w))}`} />
                        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                        <Line name="Total spend" dataKey="spend" stroke="#2563eb" strokeWidth={2} dot={false} />
                        <Line name="Flagged spend" dataKey="flagged" stroke="#b91c1c" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="p-4 text-muted">No spend in this period.</p>}
              </Panel>
              <Panel title="Policy exceptions">
                {d.policy_exceptions.length ? (
                  <table className="tbl">
                    <caption className="sr-only">Policy exceptions by type</caption>
                    <thead><tr><th scope="col">Exception</th><th scope="col" className="num">Count</th><th scope="col" className="num">Amount</th></tr></thead>
                    <tbody>
                      {d.policy_exceptions.map((p) => (
                        <tr key={p.code}><td>{p.label}</td><td className="num">{num(p.count)}</td><td className="num">{money(p.amount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="p-4 text-muted">No policy exceptions in this period.</p>}
                <p className="px-4 py-3 text-[13px] text-muted border-t border-border">
                  Review progress: {num(d.review_progress.resolved)} resolved · {num(d.review_progress.unresolved)} awaiting decision
                </p>
              </Panel>
            </div>

            <Panel title="Highest-risk findings" actions={<Link href="/anomalies" className="link text-[13px]">View all</Link>}>
              {d.top_findings.length ? <FindingsTable items={d.top_findings} caption="Highest-risk findings" compact />
                : <p className="p-4 text-muted">No anomalies detected for this period.</p>}
            </Panel>
          </div>
        )}
      </Region>
    </>
  );
}
