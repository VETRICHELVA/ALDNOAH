"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { MeContext } from "@/components/Me";
import type { User } from "@/lib/types";

const NAV = [
  ["Overview", "/overview"], ["Anomalies", "/anomalies"], ["Expenses", "/expenses"], ["Analytics", "/analytics"],
  ["Policies", "/policies"], ["Data", "/data"], ["Reports", "/reports"], ["Settings", "/settings"],
] as const;

const ROLE: Record<string, string> = { ADMIN: "Admin", FINANCE_MANAGER: "Finance manager", REVIEWER: "Reviewer", VIEWER: "Viewer" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    api<User>("/auth/me").then(setMe).catch(() => router.replace("/login"));
  }, [router]);
  useEffect(() => setOpen(false), [path]);

  async function signOut() {
    await post("/auth/logout").catch(() => {});
    router.replace("/login");
  }

  return (
    <MeContext.Provider value={me}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-surface">Skip to content</a>
      <div className="min-h-screen xl:grid xl:grid-cols-[216px_1fr]">
        <nav aria-label="Primary"
          className={`${open ? "block" : "hidden"} xl:block bg-surface border-r border-border xl:sticky xl:top-0 xl:h-screen fixed inset-y-0 left-0 w-[216px] z-30`}>
          <div className="px-5 h-14 flex items-center border-b border-border">
            <span className="font-semibold tracking-tight">Expense Sentinel</span>
          </div>
          <ul className="py-3">
            {NAV.map(([label, href]) => {
              const active = path === href || path.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? "page" : undefined}
                    className={`block px-5 py-2 text-[14px] border-l-2 ${active ? "border-primary text-ink font-medium bg-bg" : "border-transparent text-muted hover:text-ink"}`}>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {open && <div className="fixed inset-0 bg-black/20 z-20 xl:hidden" onClick={() => setOpen(false)} />}
        <div className="min-w-0">
          <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
            <button className="btn xl:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
            <span className="xl:hidden font-semibold">Expense Sentinel</span>
            <div className="hidden xl:block" />
            <div className="flex items-center gap-3 text-[13px]">
              {me && (
                <span className="hidden sm:inline">
                  {me.name} <span className="text-muted">· {ROLE[me.role]}</span>
                </span>
              )}
              <button className="btn btn-quiet" onClick={signOut}>Sign out</button>
            </div>
          </header>
          <main id="main" className="p-4 md:p-6 max-w-[1440px]">{me ? children : null}</main>
        </div>
      </div>
    </MeContext.Provider>
  );
}
