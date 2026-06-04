// Assemble the Next.js standalone output so it can run on its own inside the
// packaged desktop app. Next traces most things, but static assets, public
// files, and the Prisma query engine need to be placed next to the server.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("Missing .next/standalone — run `next build` (output: 'standalone') first.");
  process.exit(1);
}

function copy(from, to, label) {
  const src = path.join(root, from);
  if (!existsSync(src)) {
    console.warn(`skip ${label}: ${from} not found`);
    return;
  }
  const dest = path.join(standalone, to);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`copied ${label}: ${from} -> .next/standalone/${to}`);
}

// Client-side chunks and public assets the standalone server serves.
copy(".next/static", ".next/static", "static assets");
copy("public", "public", "public assets");

// Prisma client + native query engine (in case tracing missed them).
copy("node_modules/.prisma", "node_modules/.prisma", "prisma engine");
copy("node_modules/@prisma/client", "node_modules/@prisma/client", "@prisma/client");

console.log("desktop-postbuild: done");
