import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { addressOneLine } from "@/lib/sunbiz";

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;
  const query = q?.trim();

  const total = await db.entity.count();

  if (total === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Entity lookup</h1>
        <div className="card p-6 text-sm text-slate-700">
          <p className="font-medium">No entity data loaded yet.</p>
          <p className="mt-2">
            This tool searches Florida's official corporate registry locally, so you can quickly
            find who and where to serve when suing or subpoenaing a company. Load the data once
            (then refresh with the small daily files):
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            <li>
              Download <code className="rounded bg-slate-100 px-1">cordata.zip</code> from{" "}
              <span className="font-medium">sftp.floridados.gov</span> (user{" "}
              <code className="rounded bg-slate-100 px-1">Public</code>) — in a browser or any SFTP
              client.
            </li>
            <li>
              Run{" "}
              <code className="rounded bg-slate-100 px-1">
                npm run sunbiz:import -- ./cordata.zip --fresh
              </code>
              , or let the app fetch it with{" "}
              <code className="rounded bg-slate-100 px-1">
                npm run sunbiz:import -- --sftp --fresh
              </code>
              .
            </li>
          </ol>
        </div>
      </div>
    );
  }

  const isDocNumber = query ? /^[A-Za-z]?\d{5,}$/.test(query) : false;
  const results = query
    ? await db.entity.findMany({
        where: isDocNumber
          ? { documentNumber: { contains: query.toUpperCase() } }
          : { nameKey: { contains: query.toUpperCase() } },
        orderBy: { nameKey: "asc" },
        take: 100,
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Entity lookup</h1>
        <span className="text-xs text-slate-500">
          {total.toLocaleString()} Florida entities loaded
        </span>
      </div>

      <form className="flex gap-2" action="/entities" method="get">
        <input
          className="input"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search by entity name or document number…"
          autoFocus
        />
        <button className="btn-primary" type="submit">Search</button>
        {query && <Link className="btn-ghost" href="/entities">Clear</Link>}
      </form>

      {query && (
        <div className="card divide-y divide-slate-100">
          {results.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No entities match &ldquo;{query}&rdquo;.</p>
          ) : (
            results.map((e) => (
              <Link
                key={e.id}
                href={`/entities/${e.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.legalName}</div>
                  <div className="truncate text-xs text-slate-500">
                    #{e.documentNumber}
                    {e.princCity || e.princState
                      ? ` · ${addressOneLine({ city: e.princCity, state: e.princState })}`
                      : ""}
                  </div>
                </div>
                <span
                  className={`badge shrink-0 ${
                    e.status === "Active"
                      ? "bg-green-100 text-green-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {e.status ?? "—"}
                </span>
              </Link>
            ))
          )}
          {results.length === 100 && (
            <p className="p-4 text-xs text-slate-400">
              Showing first 100 matches — narrow your search to see more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
