"use client";
import { useState } from "react";
import { useMe } from "@/components/Me";
import { KV } from "@/components/evidence";
import { PageHeader, Panel, Region, useApi } from "@/components/ui";
import { ApiError, put } from "@/lib/api";
import type { Role, Settings, User } from "@/lib/types";

const ROLES: Role[] = ["ADMIN", "FINANCE_MANAGER", "REVIEWER", "VIEWER"];
const MATRIX: [string, boolean[]][] = [
  ["View expenses, findings, analytics", [true, true, true, true]],
  ["Review findings", [true, true, true, false]],
  ["Import data, export, edit policies, run analysis", [true, true, false, false]],
  ["Manage users", [true, false, false, false]],
];

export default function SettingsPage() {
  const me = useMe();
  const settings = useApi<Settings>("/settings");
  const users = useApi<User[]>("/users");
  const [msg, setMsg] = useState<string | null>(null);

  async function setRole(u: User, role: Role) {
    try { await put(`/users/${u.id}`, { role }); setMsg(`${u.name} is now ${role}.`); users.reload(); }
    catch (e) { setMsg(e instanceof ApiError ? e.detail : "Could not change role."); }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Region state={settings} rows={6}>
          {(s) => (
            <>
              <Panel title="Organization"><div className="px-4 pb-4"><KV rows={[["Name", s.org.name], ["Currency", s.org.currency], ["Timezone", s.org.timezone]]} /></div></Panel>
              <Panel title="Risk configuration">
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-[13px] text-muted">Severity: ◆ High ≥ {s.risk.thresholds.high} · ▲ Medium ≥ {s.risk.thresholds.medium} · ● Low ≥ {s.risk.thresholds.low}. Below {s.risk.thresholds.low} is auto-cleared. Read-only in this version.</p>
                  <table className="tbl">
                    <caption className="sr-only">Signal weights</caption>
                    <thead><tr><th scope="col">Signal</th><th scope="col" className="num">Max points</th></tr></thead>
                    <tbody>{s.risk.weights.map((w) => <tr key={w.code}><td>{w.label}</td><td className="num">{w.weight}</td></tr>)}</tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Data retention"><p className="px-4 pb-4 text-[13px]">Expense records, findings and the audit trail are kept for {s.retention_days} days. Review decisions are never deleted before then.</p></Panel>
            </>
          )}
        </Region>
        <Panel title="Users">
          {msg && <p role="status" className="px-4 text-[13px]">{msg}</p>}
          <Region state={users}>
            {(list) => (
              <table className="tbl">
                <caption className="sr-only">Users and roles</caption>
                <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th></tr></thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td><td className="font-mono text-[12px]">{u.email}</td>
                      <td>{me?.role === "ADMIN" && u.id !== me.id ? (
                        <select className="select" aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => setRole(u, e.target.value as Role)}>
                          {ROLES.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      ) : u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Region>
        </Panel>
        <Panel title="Roles">
          <div className="overflow-x-auto">
            <table className="tbl">
              <caption className="sr-only">Role permissions</caption>
              <thead><tr><th scope="col">Capability</th>{ROLES.map((r) => <th key={r} scope="col">{r.replace("_", " ")}</th>)}</tr></thead>
              <tbody>{MATRIX.map(([cap, ok]) => <tr key={cap}><td>{cap}</td>{ok.map((v, i) => <td key={i}>{v ? "✓ Yes" : <span className="text-muted">No</span>}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Notifications"><p className="px-4 pb-4 text-[13px] text-muted">Not available in this version. Findings appear in the review queue.</p></Panel>
        <Panel title="Security"><div className="px-4 pb-4"><KV rows={[["Sessions", "Signed, httpOnly cookie; expires after 8 hours"], ["Passwords", "Stored as bcrypt hashes"], ["Audit", "Every review, policy change and import is logged"]]} /></div></Panel>
      </div>
    </>
  );
}
