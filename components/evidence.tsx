import { money, SEV } from "@/lib/format";
import type { Severity, Signal } from "@/lib/types";

export function Tally({ signals, score, severity }: { signals: Signal[]; score: number; severity: Severity }) {
  const sorted = [...signals].sort((a, b) => b.points - a.points);
  const sum = sorted.reduce((s, x) => s + x.points, 0);
  return (
    <table className="w-full font-mono text-[13px]" aria-label="Risk score breakdown">
      <tbody>
        {sorted.map((s) => (
          <tr key={s.code}>
            <td className="py-0.5 pr-4">
              {s.label} <span className="text-muted">· {s.layer}</span>
            </td>
            <td className="num py-0.5">+{s.points}</td>
          </tr>
        ))}
        {sum > 100 && (
          <tr>
            <td className="py-0.5 text-muted">Capped at 100</td>
            <td className="num py-0.5 text-muted">−{sum - 100}</td>
          </tr>
        )}
        <tr className="border-t border-ink">
          <td className="pt-1.5 font-medium">Risk</td>
          <td className={`num pt-1.5 font-medium ${SEV[severity].cls}`}>{score}</td>
        </tr>
      </tbody>
    </table>
  );
}

type Mark = { label: string; value: number | null | undefined; kind: "current" | "limit" | "ref" };

/** One axis that places the current amount against baselines and the policy limit. */
export function AmountRuler({ current, employeeMedian, categoryMedian, limit }: {
  current: number; employeeMedian?: number | null; categoryMedian?: number | null; limit?: number | null;
}) {
  const marks: Mark[] = [
    { label: "Employee median", value: employeeMedian, kind: "ref" },
    { label: "Category median", value: categoryMedian, kind: "ref" },
    { label: "Policy limit", value: limit, kind: "limit" },
    { label: "This expense", value: current, kind: "current" },
  ].filter((m): m is Mark => m.value != null && m.value > 0) as Mark[];
  const max = Math.max(...marks.map((m) => m.value as number)) * 1.1 || 1;
  const x = (v: number) => 8 + (v / max) * 584;
  const below = marks.filter((m) => m.kind !== "current").sort((a, b) => (a.value as number) - (b.value as number));
  return (
    <figure>
      <svg viewBox="0 0 600 96" className="w-full h-auto" role="img"
        aria-label={marks.map((m) => `${m.label} ${money(m.value)}`).join(", ")}>
        <line x1="8" x2="592" y1="40" y2="40" stroke="#9ca3af" strokeWidth="1" />
        <text x="8" y="58" fontSize="11" fill="#6b7280">₹0</text>
        {below.map((m, i) => (
          <g key={m.label}>
            <line x1={x(m.value!)} x2={x(m.value!)} y1="30" y2="50" stroke={m.kind === "limit" ? "#b91c1c" : "#374151"}
              strokeWidth="1.5" strokeDasharray={m.kind === "limit" ? "3 2" : undefined} />
            <text x={x(m.value!)} y={66 + (i % 2) * 14} fontSize="11" fill={m.kind === "limit" ? "#b91c1c" : "#374151"}
              textAnchor={x(m.value!) > 480 ? "end" : x(m.value!) < 100 ? "start" : "middle"}>
              {m.label} {money(m.value)}
            </text>
          </g>
        ))}
        {marks.filter((m) => m.kind === "current").map((m) => (
          <g key="cur">
            <path d={`M ${x(m.value!)} 34 l 6 6 l -6 6 l -6 -6 z`} fill="#111827" />
            <text x={x(m.value!)} y="22" fontSize="12" fontWeight="600" fill="#111827"
              textAnchor={x(m.value!) > 480 ? "end" : x(m.value!) < 100 ? "start" : "middle"}>
              This expense {money(m.value)}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
