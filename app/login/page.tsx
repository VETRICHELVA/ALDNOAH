"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, post } from "@/lib/api";

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
        <div className="w-full max-w-[360px]">
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
          <div className="mt-4 text-[12px] text-muted space-y-1">
            <p>Demo accounts (password <span className="font-mono">Sentinel@2026</span>):</p>
            <p className="font-mono">priya.sharma@ · admin@ · reviewer@ · viewer@sentinel.demo</p>
          </div>
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
