import { money, num, pct } from "@/lib/format";

type Col<T> = { key: keyof T & string; label: string; kind?: "money" | "num" | "pct" };

export function DataTable<T extends Record<string, unknown>>({ rows, cols, caption }: { rows: T[]; cols: Col<T>[]; caption: string }) {
  if (!rows.length) return <p className="p-4 text-muted">No data for this period.</p>;
  const fmt = (v: unknown, kind?: Col<T>["kind"]) =>
    v == null ? "—" : kind === "money" ? money(Number(v)) : kind === "num" ? num(Number(v)) : kind === "pct" ? pct(Number(v), 1) : String(v);
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{cols.map((c) => <th key={c.key} scope="col" className={c.kind ? "num" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c.key} className={c.kind ? "num" : ""}>{fmt(r[c.key], c.kind)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
