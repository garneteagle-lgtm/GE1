import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: { cases: { orderBy: { openedAt: "desc" } } },
  });
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {[client.email, client.phone].filter(Boolean).join(" · ") || "No contact info"}
          </div>
        </div>
        <Link className="btn-primary" href={`/cases/new?clientId=${client.id}`}>
          New case for this client
        </Link>
      </div>

      {client.address && (
        <div className="card p-4 text-sm">
          <div className="label">Address</div>
          <div>{client.address}</div>
        </div>
      )}
      {client.notes && (
        <div className="card p-4 text-sm">
          <div className="label">Notes</div>
          <div className="whitespace-pre-wrap">{client.notes}</div>
        </div>
      )}

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Cases</h2>
        {client.cases.length === 0 ? (
          <p className="text-sm text-slate-500">No cases yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {client.cases.map((c) => (
              <li key={c.id} className="py-3">
                <Link href={`/cases/${c.id}`} className="font-medium hover:underline">
                  {c.title}
                </Link>
                <div className="text-xs text-slate-500">
                  {c.caseNumber || "no case #"} · {c.status}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
