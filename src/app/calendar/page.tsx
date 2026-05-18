import { format } from "date-fns";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string }>;
}) {
  await requireUser();
  const { synced } = await searchParams;

  const [events, cases] = await Promise.all([
    db.calendarEvent.findMany({
      orderBy: { startAt: "asc" },
      take: 200,
      include: { case: true },
    }),
    db.case.findMany({
      where: { status: "open" },
      orderBy: { title: "asc" },
      include: { client: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <form action="/api/calendar/sync" method="post">
          <button className="btn-primary" type="submit">Sync from Google Calendar</button>
        </form>
      </div>

      {synced && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Synced {synced} events.
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {events.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No events yet. Click "Sync from Google Calendar" to import the next 90 days.
          </p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-6 py-3 text-sm">
              <div>
                <div className="font-medium">{e.summary || "(untitled)"}</div>
                <div className="text-xs text-slate-500">
                  {e.startAt && format(e.startAt, "EEE MMM d, yyyy h:mm a")}
                  {e.location && ` · ${e.location}`}
                </div>
              </div>
              <form action="/api/calendar/link" method="post" className="flex items-center gap-2">
                <input type="hidden" name="eventId" value={e.id} />
                <select
                  className="input w-56"
                  name="caseId"
                  defaultValue={e.caseId ?? ""}
                >
                  <option value="">— Not linked —</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.client.name})
                    </option>
                  ))}
                </select>
                <button className="btn-outline" type="submit">Save</button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
