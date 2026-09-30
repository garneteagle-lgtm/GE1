import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { matchCase, parseFiling } from "@/lib/filings";

// Called by the Apple Mail rule script (scripts/apple-mail/) whenever a court
// filing notice arrives. Authenticated with FILING_INGEST_TOKEN rather than a
// browser session, since it runs unattended. Responds with a one-line summary
// that the script shows as a macOS notification.

function tokenOk(req: Request) {
  const expected = process.env.FILING_INGEST_TOKEN?.trim();
  if (!expected || expected.length < 16) return false;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!tokenOk(req)) return new NextResponse("unauthorized", { status: 401 });

  const form = await req.formData();
  const field = (n: string, max = 1000) => String(form.get(n) ?? "").slice(0, max).trim();
  const subject = field("subject");
  const fromAddr = field("from");
  const body = field("body", 50_000);
  // The Mail script sends epoch seconds; accept ISO strings too.
  const rawDate = field("receivedAt");
  const received = /^\d+$/.test(rawDate) ? new Date(Number(rawDate) * 1000) : new Date(rawDate);
  const receivedAt = isNaN(received.getTime()) ? new Date() : received;
  const messageId =
    field("messageId") ||
    createHash("sha256").update(`${fromAddr}|${subject}|${receivedAt.toISOString()}`).digest("hex");

  const existing = await db.filing.findUnique({ where: { messageId }, include: { case: true } });
  if (existing) return new NextResponse(summary(existing.case?.title, existing.docketText, subject));

  const parsed = parseFiling(subject, body);
  const cases = await db.case.findMany({
    where: { caseNumber: { not: null } },
    orderBy: { status: "desc" }, // "open" before "closed"
    select: { id: true, title: true, caseNumber: true },
  });
  const match = matchCase(cases, `${subject}\n${body}`);

  await db.filing.create({
    data: {
      messageId,
      fromAddr: fromAddr || null,
      subject: subject || null,
      caseNumber: parsed.caseNumber,
      docNumber: parsed.docNumber,
      docketText: parsed.docketText,
      receivedAt,
      caseId: match?.id ?? null,
    },
  });

  if (match) {
    const what = parsed.docketText ?? subject;
    await db.task.create({
      data: {
        caseId: match.id,
        title: `Review filing: ${what.length > 100 ? what.slice(0, 97) + "…" : what}`,
        dueAt: receivedAt,
      },
    });
  }

  return new NextResponse(summary(match?.title, parsed.docketText, subject));
}

function summary(caseTitle: string | undefined, docketText: string | null, subject: string) {
  const what = docketText ?? subject;
  return `${caseTitle ?? "Unmatched case"} — ${what}`.slice(0, 240);
}
