"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataTable } from "@/components/DataTable";
import { PageHeader, Panel, Region, useApi } from "@/components/ui";
import { date, money } from "@/lib/format";
import type { Analytics } from "@/lib/types";

export default function AnalyticsPage() {
  const state = useApi<Analytics>("/analytics");
  return (
    <>
      <PageHeader title="Analytics" sub="Where money goes, and where the findings come from." />
      <Region state={state} rows={12} isEmpty={(d) => d.by_department.length === 0} empty="No expenses imported yet.">
        {(d) => (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-2">
              <Panel title="Which departments spend most, and how much is flagged?">
                <div className="px-2 pb-3" style={{ height: 40 + d.by_department.length * 40 }}>
                  <ResponsiveContainer>
                    <BarChart data={d.by_department} layout="vertical" margin={{ left: 24, right: 24 }}>
                      <CartesianGrid stroke="#eef0f3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} fontSize={11} stroke="#6b7280" />
                      <YAxis type="category" dataKey="department" width={110} fontSize={12} stroke="#6b7280" />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar name="Total spend" dataKey="spend" fill="#93a8d6" />
                      <Bar name="Flagged amount" dataKey="flagged_amount" fill="#b91c1c" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Are findings being resolved as fast as they arrive?">
                <div className="h-[280px] px-2 pb-3">
                  <ResponsiveContainer>
                    <LineChart data={d.findings_trend} margin={{ left: 8, right: 16, top: 8 }}>
                      <CartesianGrid stroke="#eef0f3" vertical={false} />
                      <XAxis dataKey="week" tickFormatter={(w) => date(w).slice(0, 6)} fontSize={11} stroke="#6b7280" />
                      <YAxis allowDecimals={false} fontSize={11} stroke="#6b7280" width={32} />
                      <Tooltip labelFormatter={(w) => `Week of ${date(String(w))}`} />
                      <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                      <Line name="Findings opened" dataKey="opened" stroke="#b45309" strokeWidth={2} dot={false} />
                      <Line name="Findings resolved" dataKey="resolved" stroke="#15803d" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
            <Panel title="Which categories carry the most flagged spend?">
              <DataTable caption="Spend by category" rows={d.by_category} cols={[
                { key: "category", label: "Category" }, { key: "expenses", label: "Expenses", kind: "num" },
                { key: "spend", label: "Spend", kind: "money" }, { key: "findings", label: "Findings", kind: "num" },
                { key: "flagged_amount", label: "Flagged amount", kind: "money" }]} />
            </Panel>
            <div className="grid gap-5 xl:grid-cols-2">
              <Panel title="Who spends most, and how often are they flagged?">
                <DataTable caption="Top employees" rows={d.top_employees} cols={[
                  { key: "employee", label: "Employee" }, { key: "department", label: "Department" },
                  { key: "spend", label: "Spend", kind: "money" }, { key: "expenses", label: "Expenses", kind: "num" },
                  { key: "findings", label: "Findings", kind: "num" }]} />
              </Panel>
              <Panel title="Which vendors get the most money, and how much is flagged?">
                <DataTable caption="Top vendors" rows={d.top_vendors} cols={[
                  { key: "merchant", label: "Vendor" }, { key: "spend", label: "Spend", kind: "money" },
                  { key: "expenses", label: "Expenses", kind: "num" }, { key: "flagged_share", label: "Flagged share", kind: "pct" }]} />
              </Panel>
            </div>
            <Panel title="Which signals drive findings?">
              <DataTable caption="Signal mix" rows={d.signal_mix} cols={[{ key: "label", label: "Signal" }, { key: "count", label: "Findings", kind: "num" }]} />
            </Panel>
          </div>
        )}
      </Region>
    </>
  );
}
