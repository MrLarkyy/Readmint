import type { GitHubCache } from "./GitHubCache.js";

export interface MemoryCacheOptions {
  /** Milliseconds since the epoch; injectable for tests. */
  readonly now?: () => number;
  /** Entries kept; the oldest one is dropped first (default 32). */
  readonly maxEntries?: number;
}

interface MemoryEntry {
  readonly value: string;
  readonly expiresAt: number;
}

/** In-process cache, for a long-running editor session or tests. */
export class MemoryCache implements GitHubCache {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(options: MemoryCacheOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 32));
  }

  get(key: string): Promise<string | undefined> {
    const entry = this.entries.get(key);
    if (entry === undefined) return Promise.resolve(undefined);
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(oldest);
    }
    return Promise.resolve();
  }
}
