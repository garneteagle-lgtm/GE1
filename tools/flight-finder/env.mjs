// Minimal .env loader so the CLI has no runtime dependencies.
// Reads .env.local first, then .env; neither overwrites a real process.env value.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function parse(text) {
  const out = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv(rootDir) {
  for (const name of [".env.local", ".env"]) {
    const path = join(rootDir, name);
    if (!existsSync(path)) continue;
    let parsed;
    try {
      parsed = parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
