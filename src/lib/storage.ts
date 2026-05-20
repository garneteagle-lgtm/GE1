import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { encryptBuffer, decryptBuffer } from "@/lib/crypto";

const STORAGE_DIR = join(process.cwd(), "storage", "documents");

async function ensureDir() {
  if (!existsSync(STORAGE_DIR)) await mkdir(STORAGE_DIR, { recursive: true });
}

export async function saveUpload(file: File): Promise<{ storedName: string; size: number }> {
  await ensureDir();
  const buf = Buffer.from(await file.arrayBuffer());
  const size = buf.length; // record the plaintext size for display
  const encrypted = encryptBuffer(buf);
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 16);
  // .enc suffix makes it obvious files on disk are encrypted blobs, not the raw doc.
  const storedName = `${randomBytes(16).toString("hex")}${safeExt}.enc`;
  await writeFile(join(STORAGE_DIR, storedName), encrypted);
  return { storedName, size };
}

export async function readStored(storedName: string): Promise<Buffer> {
  const path = join(STORAGE_DIR, sanitize(storedName));
  const blob = await readFile(path);
  return decryptBuffer(blob);
}

export async function deleteStored(storedName: string): Promise<void> {
  const path = join(STORAGE_DIR, sanitize(storedName));
  if (existsSync(path)) await unlink(path);
}

function sanitize(name: string) {
  return name.replace(/[/\\.]{2,}/g, "").replace(/[/\\]/g, "");
}
