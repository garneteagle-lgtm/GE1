import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/storage";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  await requireUser();
  const form = await req.formData();
  const caseId = String(form.get("caseId") ?? "");
  const description = String(form.get("description") ?? "").trim() || null;
  const file = form.get("file");
  if (!caseId || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "missing file or caseId" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 25MB)" }, { status: 413 });
  }
  const c = await db.case.findUnique({ where: { id: caseId } });
  if (!c) return NextResponse.json({ error: "case not found" }, { status: 404 });

  const { storedName, size } = await saveUpload(file);
  await db.document.create({
    data: {
      filename: file.name,
      storedName,
      mimeType: file.type || null,
      size,
      description,
      caseId,
    },
  });
  return NextResponse.redirect(new URL(`/cases/${caseId}`, req.url), 303);
}
