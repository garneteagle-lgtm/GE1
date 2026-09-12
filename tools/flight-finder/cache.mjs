// On-disk response cache. Amadeus free tier allows ~2000 calls/month and a
// flexible-date sweep burns a dozen per search, so repeat runs read from here.
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export class Cache {
  constructor(dir, { ttlMs = 6 * 60 * 60 * 1000, enabled = true } = {}) {
    this.dir = dir;
    this.ttlMs = ttlMs;
    this.enabled = enabled;
    this.hits = 0;
    this.misses = 0;
  }

  #path(key) {
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
    return join(this.dir, `${hash}.json`);
  }

  get(key) {
    if (!this.enabled) return undefined;
    const path = this.#path(key);
    if (!existsSync(path)) {
      this.misses += 1;
      return undefined;
    }
    try {
      const entry = JSON.parse(readFileSync(path, "utf8"));
      if (Date.now() - entry.storedAt > this.ttlMs) {
        this.misses += 1;
        return undefined;
      }
      this.hits += 1;
      return entry.value;
    } catch {
      this.misses += 1;
      return undefined;
    }
  }

  set(key, value) {
    if (!this.enabled) return;
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(this.#path(key), JSON.stringify({ storedAt: Date.now(), key, value }));
    } catch {
      // A cache that cannot write is not a reason to fail the search.
    }
  }

  clear() {
    try {
      rmSync(this.dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
