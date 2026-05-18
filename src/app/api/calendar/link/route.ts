import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const eventId = String(form.get("eventId") ?? "");
  const caseId = String(form.get("caseId") ?? "");
  if (!eventId) return NextResponse.json({ error: "missing eventId" }, { status: 400 });

  await db.calendarEvent.update({
    where: { id: eventId },
    data: { caseId: caseId || null },
  });
  return NextResponse.redirect(new URL("/calendar", req.url), 303);
}
