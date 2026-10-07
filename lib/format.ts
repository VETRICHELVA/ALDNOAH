import type { Severity } from "./types";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (n: number | null | undefined) => (n == null ? "—" : inr.format(n));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function date(s: string | null | undefined) {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}
export function dateTime(s: string) {
  const t = new Date(s);
  return `${date(s)} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
export const num = (n: number) => new Intl.NumberFormat("en-IN").format(n);
export const pct = (n: number | null | undefined, digits = 0) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);

export const SEV: Record<Severity, { mark: string; label: string; cls: string }> = {
  high: { mark: "◆", label: "High", cls: "text-danger" },
  medium: { mark: "▲", label: "Medium", cls: "text-warning" },
  low: { mark: "●", label: "Low", cls: "text-info" },
};

export const confidenceLabel = (c: number) => (c >= 0.8 ? "High" : c >= 0.6 ? "Medium" : "Low");

export const STATUS_LABEL: Record<string, string> = {
  open: "Requires review",
  in_review: "In review",
  evidence_requested: "Evidence requested",
  escalated: "Escalated",
  approved: "Approved",
  rejected: "Rejected",
  legitimate: "Marked legitimate",
  pending: "Pending",
};

export function qs(params: Record<string, string | number | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
