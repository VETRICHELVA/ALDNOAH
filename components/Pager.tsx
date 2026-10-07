"use client";
import { num } from "@/lib/format";

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between px-4 py-2 border-t border-border text-[13px]">
      <span className="text-muted">
        {total ? `${num((page - 1) * pageSize + 1)}–${num(Math.min(page * pageSize, total))} of ${num(total)}` : "0 results"}
      </span>
      <span className="flex gap-2">
        <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </span>
    </nav>
  );
}
