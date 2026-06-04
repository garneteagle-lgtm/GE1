/**
 * Import Florida's official corporate registry (sunbiz "cordata") into the
 * local database, so entities can be searched offline for service of process.
 *
 * Usage:
 *   npm run sunbiz:import -- <path-to-cordata.txt|.zip>   import a local file
 *   npm run sunbiz:import -- --sftp                       download + import latest quarterly
 *   npm run sunbiz:import -- --sftp --daily 20260603      download + import one daily file
 *   npm run sunbiz:import -- <file> --dry-run             parse & print first rows, write nothing
 *   npm run sunbiz:import -- <file> --fresh               wipe table, then fast bulk insert
 *   npm run sunbiz:import -- <file> --active-only         skip inactive entities
 *
 * The full quarterly file is large (millions of records); use --fresh for the
 * initial load. Daily files are small and should be imported with upsert
 * (the default) so they update existing records.
 *
 * Data source (public, free):
 *   Host: sftp.floridados.gov   User: Public   Pass: PubAccess1845!
 *   Override via env SUNBIZ_SFTP_HOST / SUNBIZ_SFTP_USER / SUNBIZ_SFTP_PASS.
 */
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type { Readable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { parseRecord, COR_RECORD_LENGTH, type ParsedEntity } from "../src/lib/sunbiz-layout";

const db = new PrismaClient();

const SFTP = {
  host: process.env.SUNBIZ_SFTP_HOST || "sftp.floridados.gov",
  username: process.env.SUNBIZ_SFTP_USER || "Public",
  password: process.env.SUNBIZ_SFTP_PASS || "PubAccess1845!",
  // Public directory layout on the FL SFTP server.
  quarterlyPath: process.env.SUNBIZ_SFTP_QUARTERLY || "/Public/doc/cor/cordata.zip",
  dailyDir: process.env.SUNBIZ_SFTP_DAILY_DIR || "/Public/doc/cor",
};

type Args = {
  file?: string;
  sftp: boolean;
  daily?: string;
  dryRun: boolean;
  fresh: boolean;
  activeOnly: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = { sftp: false, dryRun: false, fresh: false, activeOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sftp") a.sftp = true;
    else if (arg === "--dry-run") a.dryRun = true;
    else if (arg === "--fresh") a.fresh = true;
    else if (arg === "--active-only") a.activeOnly = true;
    else if (arg === "--daily") a.daily = argv[++i];
    else if (!arg.startsWith("--")) a.file = arg;
  }
  return a;
}

/** Download a file from the public FL SFTP server to a local path. */
async function downloadSftp(remote: string, local: string): Promise<string> {
  let Client: any;
  try {
    Client = (await import("ssh2-sftp-client")).default;
  } catch {
    throw new Error(
      "SFTP download needs the 'ssh2-sftp-client' package. Run `npm install`, " +
        "or download the file from sunbiz in a browser and pass its path instead.",
    );
  }
  const sftp = new Client();
  console.log(`Connecting to ${SFTP.host} …`);
  await sftp.connect({ host: SFTP.host, username: SFTP.username, password: SFTP.password });
  try {
    console.log(`Downloading ${remote} …`);
    await sftp.fastGet(remote, local);
  } finally {
    await sftp.end();
  }
  return local;
}

/** Return a readable stream of uncompressed cordata text for a .zip or .txt. */
async function openInput(filePath: string): Promise<Readable> {
  if (filePath.toLowerCase().endsWith(".zip")) {
    let unzipper: any;
    try {
      unzipper = await import("unzipper");
    } catch {
      throw new Error(
        "Reading a .zip needs the 'unzipper' package. Run `npm install`, or " +
          "unzip the file yourself and pass the resulting .txt path.",
      );
    }
    const directory = await unzipper.Open.file(filePath);
    const entry =
      directory.files.find((f: any) => f.path.toLowerCase().endsWith(".txt")) ??
      directory.files[0];
    if (!entry) throw new Error(`No files found inside ${filePath}`);
    console.log(`Reading ${entry.path} from archive …`);
    return entry.stream();
  }
  return createReadStream(filePath);
}

async function resolveInputPath(args: Args): Promise<string> {
  if (args.file) return args.file;
  if (args.sftp) {
    const dir = path.join(process.cwd(), "storage", "sunbiz");
    await mkdir(dir, { recursive: true });
    if (args.daily) {
      const name = `cordata${args.daily}.zip`;
      return downloadSftp(`${SFTP.dailyDir}/${name}`, path.join(dir, name));
    }
    return downloadSftp(SFTP.quarterlyPath, path.join(dir, "cordata.zip"));
  }
  throw new Error("Pass a file path, or --sftp to download. See header for usage.");
}

async function upsertBatch(batch: ParsedEntity[]) {
  await db.$transaction(
    batch.map((e) =>
      db.entity.upsert({
        where: { documentNumber: e.documentNumber },
        create: { ...e, source: "FL-SFTP", lastSyncedAt: new Date() },
        update: { ...e, source: "FL-SFTP", lastSyncedAt: new Date() },
      }),
    ),
  );
}

async function insertBatch(batch: ParsedEntity[]) {
  // SQLite's createMany has no skipDuplicates; on a rare duplicate document
  // number within the file, fall back to upserting that batch.
  try {
    await db.entity.createMany({ data: batch.map((e) => ({ ...e, source: "FL-SFTP" })) });
  } catch {
    await upsertBatch(batch);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = await resolveInputPath(args);
  const stream = await openInput(inputPath);

  // Wipe BEFORE attaching the readline iterator — creating the interface puts
  // the stream into flowing mode, and any await between would drop lines.
  if (args.fresh && !args.dryRun) {
    console.log("Wiping existing entities (--fresh) …");
    await db.entity.deleteMany();
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const BATCH = 500;
  let batch: ParsedEntity[] = [];
  let read = 0;
  let written = 0;
  let skippedInactive = 0;
  let badLength = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    if (args.fresh) await insertBatch(batch);
    else await upsertBatch(batch);
    written += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    read++;
    if (line.length !== COR_RECORD_LENGTH) badLength++;
    const rec = parseRecord(line);
    if (!rec) continue;
    if (args.activeOnly && rec.status !== "Active") {
      skippedInactive++;
      continue;
    }

    if (args.dryRun) {
      if (written < 5) {
        console.log("\n" + JSON.stringify(rec, null, 2));
        written++;
      }
      continue;
    }

    batch.push(rec);
    if (batch.length >= BATCH) {
      await flush();
      if (written % 50000 === 0) console.log(`  … ${written.toLocaleString()} written`);
    }
  }
  if (!args.dryRun) await flush();

  console.log("\nDone.");
  console.log(`  Lines read:        ${read.toLocaleString()}`);
  console.log(`  Records ${args.dryRun ? "previewed" : "written"}:   ${written.toLocaleString()}`);
  if (args.activeOnly) console.log(`  Inactive skipped:  ${skippedInactive.toLocaleString()}`);
  if (badLength) {
    console.log(
      `  ⚠ ${badLength.toLocaleString()} line(s) were not ${COR_RECORD_LENGTH} chars long — ` +
        `if many, the layout in src/lib/sunbiz-layout.ts may be out of date.`,
    );
  }
}

main()
  .catch((err) => {
    console.error("\nImport failed:", err.message || err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
