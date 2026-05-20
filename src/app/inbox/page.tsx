import Link from "next/link";
import { format } from "date-fns";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string }>;
}) {
  await requireUser();
  const { synced } = await searchParams;

  const emails = await db.emailMessage.findMany({
    orderBy: { sentAt: "desc" },
    take: 100,
    include: { case: { include: { client: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <form action="/api/gmail/sync" method="post">
          <button className="btn-primary" type="submit">Sync all clients</button>
        </form>
      </div>

      {synced && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Synced {synced} new messages.
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {emails.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No messages yet. Click "Sync all clients" to pull recent Gmail messages
            to/from any client email address.
          </p>
        ) : (
          emails.map((e) => (
            <div key={e.id} className="px-6 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">{e.subject || "(no subject)"}</div>
                <div className="text-xs text-slate-500">
                  {e.sentAt && format(e.sentAt, "MMM d, yyyy")}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                {e.fromAddr} → {e.toAddr}
                {e.case && (
                  <>
                    {" · "}
                    <Link className="hover:underline" href={`/cases/${e.case.id}`}>
                      {e.case.title}
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
