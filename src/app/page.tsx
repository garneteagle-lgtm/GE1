import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { formatDistanceToNowStrict, format, isPast } from "date-fns";

export default async function Dashboard() {
  await requireUser();

  const [openCases, upcomingDeadlines, openTasks, recentEmails] = await Promise.all([
    db.case.count({ where: { status: "open" } }),
    db.deadline.findMany({
      where: { dueAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { dueAt: "asc" },
      take: 10,
      include: { case: { include: { client: true } } },
    }),
    db.task.findMany({
      where: { done: false },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 10,
      include: { case: { include: { client: true } } },
    }),
    db.emailMessage.findMany({
      where: { caseId: { not: null } },
      orderBy: { sentAt: "desc" },
      take: 5,
      include: { case: { include: { client: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Link className="btn-outline" href="/clients/new">New client</Link>
          <Link className="btn-primary" href="/cases/new">New case</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Open cases" value={openCases} href="/cases" />
        <Stat label="Upcoming deadlines" value={upcomingDeadlines.length} href="#deadlines" />
        <Stat label="Open tasks" value={openTasks.length} href="#tasks" />
      </div>

      <section id="deadlines" className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upcoming deadlines</h2>
        </div>
        {upcomingDeadlines.length === 0 ? (
          <p className="text-sm text-slate-500">No deadlines logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcomingDeadlines.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-slate-500">
                    <Link className="hover:underline" href={`/cases/${d.case.id}`}>
                      {d.case.title}
                    </Link>{" "}
                    · {d.case.client.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className={isPast(d.dueAt) ? "text-red-600" : "text-slate-700"}>
                    {format(d.dueAt, "MMM d, yyyy")}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatDistanceToNowStrict(d.dueAt, { addSuffix: true })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="tasks" className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Open tasks</h2>
        {openTasks.length === 0 ? (
          <p className="text-sm text-slate-500">No open tasks.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {openTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-slate-500">
                    <Link className="hover:underline" href={`/cases/${t.case.id}`}>
                      {t.case.title}
                    </Link>{" "}
                    · {t.case.client.name}
                  </div>
                </div>
                {t.dueAt && (
                  <div className={isPast(t.dueAt) ? "text-red-600" : "text-slate-700"}>
                    {format(t.dueAt, "MMM d")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {recentEmails.length > 0 && (
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Recent client emails</h2>
          <ul className="divide-y divide-slate-100">
            {recentEmails.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <div className="font-medium">{e.subject || "(no subject)"}</div>
                <div className="text-xs text-slate-500">
                  {e.fromAddr} ·{" "}
                  {e.case && (
                    <Link className="hover:underline" href={`/cases/${e.case.id}`}>
                      {e.case.title}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card flex flex-col gap-1 p-4 hover:bg-slate-50">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-3xl font-semibold">{value}</div>
    </Link>
  );
}
