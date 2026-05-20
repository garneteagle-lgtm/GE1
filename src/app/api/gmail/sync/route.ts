import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { gmailClient } from "@/lib/google";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");

  const gmail = await gmailClient(session.user.id);

  if (caseId) {
    const c = await db.case.findUnique({ where: { id: caseId }, include: { client: true } });
    if (!c) return NextResponse.json({ error: "case not found" }, { status: 404 });
    const email = c.client.email;
    if (!email) {
      return NextResponse.json({ error: "client has no email" }, { status: 400 });
    }
    const count = await syncForEmail(gmail, session.user.id, email, c.id);
    return NextResponse.redirect(new URL(`/cases/${caseId}`, req.url), 303);
  }

  // Sync for all clients with emails
  const clients = await db.client.findMany({
    where: { email: { not: null } },
    include: { cases: { take: 1, orderBy: { openedAt: "desc" } } },
  });
  let total = 0;
  for (const client of clients) {
    const caseIdForClient = client.cases[0]?.id;
    if (!client.email || !caseIdForClient) continue;
    total += await syncForEmail(gmail, session.user.id, client.email, caseIdForClient);
  }
  return NextResponse.redirect(new URL(`/inbox?synced=${total}`, req.url), 303);
}

async function syncForEmail(
  gmail: Awaited<ReturnType<typeof gmailClient>>,
  _userId: string,
  email: string,
  caseId: string,
) {
  const query = `(from:${email} OR to:${email}) newer_than:1y`;
  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 25,
  });
  const messages = list.data.messages ?? [];
  let count = 0;
  for (const m of messages) {
    if (!m.id) continue;
    const existing = await db.emailMessage.findUnique({ where: { gmailId: m.id } });
    if (existing) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });
    const headers = full.data.payload?.headers ?? [];
    const h = (n: string) => headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value;
    const dateStr = h("Date");
    await db.emailMessage.create({
      data: {
        gmailId: m.id,
        threadId: full.data.threadId ?? null,
        fromAddr: h("From") ?? null,
        toAddr: h("To") ?? null,
        subject: h("Subject") ?? null,
        sentAt: dateStr ? new Date(dateStr) : null,
        caseId,
      },
    });
    count++;
  }
  return count;
}
