"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FindingsTable } from "@/components/FindingsTable";
import { Pager } from "@/components/Pager";
import { PageHeader, Panel, Region, Skeleton, useApi } from "@/components/ui";
import { num, qs } from "@/lib/format";
import type { FindingRow, Page, Tab } from "@/lib/types";

const TABS: [Tab, string][] = [
  ["needs_review", "Needs review"], ["all", "All"], ["high_risk", "High risk"],
  ["policy", "Policy issues"], ["duplicates", "Duplicates"], ["resolved", "Resolved"],
];

function AnomalyCenter() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = (sp.get("tab") as Tab) || "needs_review";
  const q = sp.get("q") ?? "";
  const severity = sp.get("severity") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const query = qs({ tab, q, severity, page: page > 1 ? page : null });
  const state = useApi<Page<FindingRow> & { counts: Record<Tab, number> }>(`/anomalies${query}`);
  const [search, setSearch] = useState(q);

  const set = (patch: Record<string, string | number | null>) =>
    router.push(path + qs({ tab, q, severity, ...patch, page: patch.page ?? null }));

  return (
    <>
      <PageHeader title="Anomalies" sub="Findings ranked by risk. Every score breaks down into the signals that produced it." />
      <div role="tablist" aria-label="Finding queues" className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => set({ tab: key })}
            className={`px-3 py-2 text-[14px] -mb-px border-b-2 whitespace-nowrap ${tab === key ? "border-primary font-medium" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
            {state.data && <span className="ml-1.5 text-muted num">{num(state.data.counts?.[key] ?? 0)}</span>}
          </button>
        ))}
      </div>
      <form className="flex flex-wrap gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); set({ q: search }); }}>
        <label className="sr-only" htmlFor="q">Search findings</label>
        <input id="q" className="input w-72" placeholder="Search employee, vendor, ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="sr-only" htmlFor="sev">Severity</label>
        <select id="sev" className="select" value={severity} onChange={(e) => set({ severity: e.target.value })}>
          <option value="">All severities</option>
          <option value="high">◆ High</option>
          <option value="medium">▲ Medium</option>
          <option value="low">● Low</option>
        </select>
        <button className="btn">Search</button>
      </form>
      <Panel>
        <Region state={state} isEmpty={(d) => d.items.length === 0}
          empty={tab === "needs_review" ? "Nothing requires review. All findings have a decision." : "No anomalies detected for this view."}>
          {(d) => (
            <>
              <FindingsTable items={d.items} query={query} caption="Findings ranked by risk, highest first" />
              <Pager page={d.page} pageSize={d.page_size} total={d.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </Region>
      </Panel>
    </>
  );
}

export default function Page_() {
  return <Suspense fallback={<Skeleton />}><AnomalyCenter /></Suspense>;
}
