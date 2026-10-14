import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitHubCache } from "../GitHubCache.js";

export interface FileCacheOptions {
  /** Created with mode 0o700 when missing. */
  readonly directory: string;
  /** Milliseconds since the epoch; injectable for tests. */
  readonly now?: () => number;
}

/** Largest entry file read back; a bigger one is treated as a miss. */
export const FILE_CACHE_MAX_ENTRY_BYTES = 16 * 1024 * 1024;

const KEY_PATTERN = /^[0-9a-f]{64}$/;

/**
 * One `<key>.json` file per entry, `{ storedAt, ttlSeconds, value }`, written atomically with
 * mode 0o600. Corrupt, oversized or expired files read as a miss.
 */
export class FileCache implements GitHubCache {
  private readonly directory: string;
  private readonly now: () => number;

  constructor(options: FileCacheOptions) {
    this.directory = options.directory;
    this.now = options.now ?? Date.now;
  }

  async get(key: string): Promise<string | undefined> {
    if (!KEY_PATTERN.test(key)) return undefined;
    let text: string;
    try {
      const handle = await open(this.pathOf(key), "r");
      try {
        if ((await handle.stat()).size > FILE_CACHE_MAX_ENTRY_BYTES) return undefined;
        text = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
    } catch {
      return undefined;
    }
    return this.readEntry(text);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    // The key becomes a file name, so it must stay a bare digest.
    if (!KEY_PATTERN.test(key)) throw new TypeError("A cache key must be a SHA-256 hex digest.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const entry = JSON.stringify({ storedAt: this.now(), ttlSeconds, value });
    const temporary = join(this.directory, `${key}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, entry, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, this.pathOf(key));
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  private pathOf(key: string): string {
    return join(this.directory, `${key}.json`);
  }

  private readEntry(text: string): string | undefined {
    let entry: unknown;
    try {
      entry = JSON.parse(text);
    } catch {
      return undefined;
    }
    if (typeof entry !== "object" || entry === null) return undefined;
    const { storedAt, ttlSeconds, value } = entry as Record<string, unknown>;
    if (typeof storedAt !== "number" || typeof ttlSeconds !== "number") return undefined;
    if (typeof value !== "string") return undefined;
    const age = this.now() - storedAt;
    if (!(age >= 0 && age < ttlSeconds * 1000)) return undefined;
    return value;
  }
}
