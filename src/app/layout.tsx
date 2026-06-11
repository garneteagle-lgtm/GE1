import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { TimerBanner } from "./timer-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Case Manager",
  description: "Case management for solo and small-firm lawyers",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  const runningEntry = session?.user
    ? await db.timeEntry.findFirst({
        where: { running: true },
        orderBy: { startedAt: "desc" },
        include: { case: { include: { client: true } } },
      })
    : null;

  const running =
    runningEntry && runningEntry.startedAt
      ? {
          caseId: runningEntry.caseId,
          caseTitle: runningEntry.case.title,
          clientName: runningEntry.case.client.name,
          startedAt: runningEntry.startedAt.toISOString(),
        }
      : null;

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-slate-200 bg-white print:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Case Manager
            </Link>
            {session?.user ? (
              <nav className="flex items-center gap-1 text-sm">
                <Link className="btn-ghost" href="/">Dashboard</Link>
                <Link className="btn-ghost" href="/cases">Cases</Link>
                <Link className="btn-ghost" href="/clients">Clients</Link>
                <Link className="btn-ghost" href="/billing">Billing</Link>
                <Link className="btn-ghost" href="/inbox">Inbox</Link>
                <Link className="btn-ghost" href="/calendar">Calendar</Link>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-xs text-slate-500">{session.user.email}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                >
                  <button className="btn-ghost" type="submit">Sign out</button>
                </form>
              </nav>
            ) : (
              <Link className="btn-outline" href="/signin">Sign in</Link>
            )}
          </div>
        </header>
        <TimerBanner running={running} />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
