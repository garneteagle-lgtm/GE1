import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const STORAGE_DIR = join(process.cwd(), "storage", "documents");

async function ensureDir() {
  if (!existsSync(STORAGE_DIR)) await mkdir(STORAGE_DIR, { recursive: true });
}

export async function saveUpload(file: File): Promise<{ storedName: string; size: number }> {
  await ensureDir();
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 16);
  const storedName = `${randomBytes(16).toString("hex")}${safeExt}`;
  await writeFile(join(STORAGE_DIR, storedName), buf);
  return { storedName, size: buf.length };
}

export async function readStored(storedName: string): Promise<Buffer> {
  return readFile(join(STORAGE_DIR, sanitize(storedName)));
}

export async function deleteStored(storedName: string): Promise<void> {
  const path = join(STORAGE_DIR, sanitize(storedName));
  if (existsSync(path)) await unlink(path);
}

function sanitize(name: string) {
  // Stored names are hex + extension, but guard against path traversal anyway.
  return name.replace(/[/\\.]{2,}/g, "").replace(/[/\\]/g, "");
}
