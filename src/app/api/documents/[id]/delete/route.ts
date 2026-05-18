import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { deleteStored } from "@/lib/storage";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  await deleteStored(doc.storedName);
  await db.document.delete({ where: { id } });
  return NextResponse.redirect(new URL(`/cases/${doc.caseId}`, req.url), 303);
}
