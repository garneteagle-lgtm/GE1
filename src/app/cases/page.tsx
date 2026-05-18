import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { format } from "date-fns";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireUser();
  const { status, q } = await searchParams;
  const filter = status === "closed" ? "closed" : status === "all" ? undefined : "open";
  const query = q?.trim();

  const cases = await db.case.findMany({
    where: {
      ...(filter ? { status: filter } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query } },
              { caseNumber: { contains: query } },
              { court: { contains: query } },
              { practiceArea: { contains: query } },
              { opposing: { contains: query } },
              { description: { contains: query } },
              { client: { name: { contains: query } } },
            ],
          }
        : {}),
    },
    orderBy: { openedAt: "desc" },
    include: { client: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cases</h1>
        <Link className="btn-primary" href="/cases/new">New case</Link>
      </div>

      <form className="flex gap-2" action="/cases" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          className="input"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search by case title, number, client, opposing party…"
        />
        <button className="btn-outline" type="submit">Search</button>
        {query && (
          <Link className="btn-ghost" href={status ? `/cases?status=${status}` : "/cases"}>
            Clear
          </Link>
        )}
      </form>

      <div className="flex gap-1 text-sm">
        <FilterLink
          href={query ? `/cases?q=${encodeURIComponent(query)}` : "/cases"}
          label="Open"
          active={!status || status === "open"}
        />
        <FilterLink
          href={`/cases?status=closed${query ? `&q=${encodeURIComponent(query)}` : ""}`}
          label="Closed"
          active={status === "closed"}
        />
        <FilterLink
          href={`/cases?status=all${query ? `&q=${encodeURIComponent(query)}` : ""}`}
          label="All"
          active={status === "all"}
        />
      </div>

      <div className="card divide-y divide-slate-100">
        {cases.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {query ? `No cases match "${query}".` : "No cases."}
          </p>
        ) : (
          cases.map((c) => (
            <Link
              key={c.id}
              href={`/cases/${c.id}`}
              className="flex items-center justify-between px-6 py-4 hover:bg-slate-50"
            >
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-slate-500">
                  {c.client.name} · {c.caseNumber || "no case #"} ·{" "}
                  {format(c.openedAt, "MMM d, yyyy")}
                </div>
              </div>
              <span
                className={`badge ${
                  c.status === "open"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {c.status}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 ${
        active ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );
}
