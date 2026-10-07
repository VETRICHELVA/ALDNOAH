"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, post } from "@/lib/api";

const DEMO_PASSWORD = "Sentinel@2026";
const DEMO_ACCOUNTS = [
  { email: "priya.sharma@sentinel.demo", role: "Finance manager", can: "Review, upload data, edit policies, export" },
  { email: "reviewer@sentinel.demo", role: "Reviewer", can: "Investigate and decide on findings" },
  { email: "viewer@sentinel.demo", role: "Viewer", can: "Read-only" },
  { email: "admin@sentinel.demo", role: "Admin", can: "Everything, plus user roles" },
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("priya.sharma@sentinel.demo");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/auth/login", { email, password });
      router.replace("/overview");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Email or password is incorrect."
        : err instanceof ApiError && err.status ? err.detail : "The server could not be reached. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[540px]">
          <h1 className="page-title mb-1">Expense Sentinel</h1>
          <p className="text-muted mb-6">Sign in to review flagged expenses.</p>
          <form onSubmit={submit} className="panel p-5 space-y-4" noValidate>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">Work email</span>
              <input className="input h-9" type="email" autoComplete="username" required value={email}
                onChange={(e) => setEmail(e.target.value)} aria-describedby={error ? "login-error" : undefined} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">Password</span>
              <input className="input h-9" type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} aria-describedby={error ? "login-error" : undefined} />
            </label>
            {error && <p id="login-error" role="alert" className="text-danger text-[13px]">{error}</p>}
            <button className="btn btn-primary w-full justify-center h-9" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <section className="panel mt-5" aria-labelledby="demo-accounts">
            <div className="px-4 pt-3 pb-2">
              <h2 id="demo-accounts" className="label">Demo accounts for reviewers</h2>
              <p className="text-[13px] text-muted mt-1">
                All accounts use the password <span className="font-mono text-ink">{DEMO_PASSWORD}</span>. Start with the finance manager.
              </p>
            </div>
            <div className="overflow-x-auto">
            <table className="tbl">
              <caption className="sr-only">Demo accounts, roles and permissions</caption>
              <thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col"><span className="sr-only">Fill in</span></th></tr></thead>
              <tbody>
                {DEMO_ACCOUNTS.map((a) => (
                  <tr key={a.email}>
                    <td><span className="font-mono text-[12px] whitespace-nowrap">{a.email}</span></td>
                    <td><span className="block">{a.role}</span><span className="block text-[12px] text-muted">{a.can}</span></td>
                    <td className="text-right">
                      <button type="button" className="btn btn-quiet" aria-label={`Fill in ${a.role} account`}
                        onClick={() => { setEmail(a.email); setPassword(DEMO_PASSWORD); setError(null); }}>Use</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        </div>
      </main>
      <footer className="text-[12px] text-muted flex flex-wrap gap-4 justify-center p-4 border-t border-border">
        <a className="hover:text-ink" href="/privacy">Privacy</a>
        <a className="hover:text-ink" href="/terms">Terms</a>
        <a className="hover:text-ink" href="mailto:support@sentinel.demo">Support</a>
      </footer>
    </div>
  );
}
