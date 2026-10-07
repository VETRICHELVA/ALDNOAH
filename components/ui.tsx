"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { SEV, STATUS_LABEL } from "@/lib/format";
import type { Severity } from "@/lib/types";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof ApiError ? e : new ApiError(0, String(e))))
      .finally(() => setLoading(false));
  }, [path]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}

export function Skeleton({ rows = 6, height = 20 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height, width: `${90 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-muted">{children}</p>;
}

export function ErrorState({ error, retry }: { error: ApiError; retry?: () => void }) {
  const why =
    error.status === 0 ? "The server could not be reached. Check your connection or that the API is running."
    : error.status === 403 ? "Your role does not have permission for this."
    : error.status >= 500 ? "The server ran into a problem processing this request."
    : error.detail;
  return (
    <div role="alert" className="p-6 space-y-2">
      <p className="font-medium">This data could not be loaded.</p>
      <p className="text-muted">{why}</p>
      {retry && <button className="btn" onClick={retry}>Try again</button>}
    </div>
  );
}

/** Wraps a loading/error/empty-aware region. */
export function Region<T>({
  state, empty, isEmpty, children, rows,
}: {
  state: { data: T | null; error: ApiError | null; loading: boolean; reload: () => void };
  empty?: React.ReactNode;
  isEmpty?: (d: T) => boolean;
  children: (d: T) => React.ReactNode;
  rows?: number;
}) {
  if (state.error) return <ErrorState error={state.error} retry={state.reload} />;
  if (!state.data) return <Skeleton rows={rows} />;
  if (isEmpty?.(state.data)) return <Empty>{empty}</Empty>;
  return <>{children(state.data)}</>;
}

export function RiskMark({ severity, score }: { severity: Severity; score: number }) {
  const s = SEV[severity];
  return (
    <span className={`${s.cls} font-medium whitespace-nowrap num`}>
      <span aria-hidden>{s.mark}</span> {s.label} · {score}
    </span>
  );
}

export function Status({ status }: { status: string }) {
  const cls =
    status === "approved" || status === "legitimate" ? "text-success"
    : status === "rejected" ? "text-danger"
    : status === "escalated" || status === "evidence_requested" ? "text-warning"
    : "text-ink";
  return <span className={cls}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Panel({ title, children, className = "", actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <h2 className="label">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="text-muted mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}
