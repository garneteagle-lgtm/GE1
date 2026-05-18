import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { readStored } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const buf = await readStored(doc.storedName);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.filename)}"`,
      "Content-Length": String(doc.size),
    },
  });
}
