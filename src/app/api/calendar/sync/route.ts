import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { calendarClient } from "@/lib/google";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cal = await calendarClient(session.user.id);
  const now = new Date();
  const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
  });

  const events = res.data.items ?? [];
  let count = 0;
  for (const e of events) {
    if (!e.id) continue;
    const startStr = e.start?.dateTime ?? e.start?.date;
    const endStr = e.end?.dateTime ?? e.end?.date;
    await db.calendarEvent.upsert({
      where: { googleEventId: e.id },
      create: {
        googleEventId: e.id,
        summary: e.summary ?? null,
        description: e.description ?? null,
        location: e.location ?? null,
        startAt: startStr ? new Date(startStr) : null,
        endAt: endStr ? new Date(endStr) : null,
        htmlLink: e.htmlLink ?? null,
      },
      update: {
        summary: e.summary ?? null,
        description: e.description ?? null,
        location: e.location ?? null,
        startAt: startStr ? new Date(startStr) : null,
        endAt: endStr ? new Date(endStr) : null,
        htmlLink: e.htmlLink ?? null,
      },
    });
    count++;
  }
  return NextResponse.redirect(new URL(`/calendar?synced=${count}`, req.url), 303);
}
