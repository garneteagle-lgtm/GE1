import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

export default async function ClientsPage() {
  await requireUser();
  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { cases: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Link className="btn-primary" href="/clients/new">New client</Link>
      </div>

      <div className="card divide-y divide-slate-100">
        {clients.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No clients yet.</p>
        ) : (
          clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex items-center justify-between px-6 py-4 hover:bg-slate-50"
            >
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-slate-500">{c.email || c.phone || "—"}</div>
              </div>
              <div className="text-sm text-slate-500">{c._count.cases} cases</div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
