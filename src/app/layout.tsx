import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
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

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Case Manager
            </Link>
            {session?.user ? (
              <nav className="flex items-center gap-1 text-sm">
                <Link className="btn-ghost" href="/">Dashboard</Link>
                <Link className="btn-ghost" href="/cases">Cases</Link>
                <Link className="btn-ghost" href="/clients">Clients</Link>
                <Link className="btn-ghost" href="/inbox">Inbox</Link>
                <Link className="btn-ghost" href="/calendar">Calendar</Link>
                <Link className="btn-ghost" href="/letterhead">Letters</Link>
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
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
