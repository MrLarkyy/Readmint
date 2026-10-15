import { bytesKey, sameBytes } from "./bytesKey.js";
import { EntropyBudget, maxRenderEntropySteps } from "./EntropyBudget.js";
import { entropyRefusal } from "./jpegRefusals.js";
import type { ImageInfo, SniffResult } from "./sniffImage.js";

/** The real check a cache miss runs: the sniff of `data` charging `budget`. */
export type SniffCheck = (data: Uint8Array, budget: EntropyBudget) => SniffResult;

/** What a `SniffCache` holds and has answered. */
export interface SniffCacheStats {
  readonly hits: number;
  readonly misses: number;
  /** Image bytes held, over every entry. */
  readonly bytes: number;
  readonly entries: number;
}

type Accepted = Extract<SniffResult, { readonly ok: true }>;

interface SniffEntry {
  /** A copy of the bytes the result belongs to: a key match counts only when these are equal byte for byte. */
  readonly data: Uint8Array;
  readonly result: Accepted;
  /** The symbol-check steps the first check charged; every hit charges the same. */
  readonly steps: number;
}

/**
 * Accepted JPEG sniff results by their bytes, so an image checked once is not checked again by a later render, a later
 * frame or the raster pass: a 3 MB progressive JPEG takes about 200 ms. What the caller sees is what an empty cache
 * gives, entropy budget included: a hit charges the steps its first check took, and one that has less left fails the
 * way the real check would have, with the budget spent and `exhausted` set. Only accepted results are kept (a refusal
 * may depend on what the budget had left). Bounded by `maxBytes` of image data and `maxEntries` entries, the least
 * recently used dropped first; an image above `maxBytes` alone is never kept.
 */
export class SniffCache {
  private readonly entries = new Map<string, SniffEntry>();
  private heldBytes = 0;
  private hits = 0;
  private misses = 0;

  constructor(
    readonly maxBytes = 32 * 1024 * 1024,
    readonly maxEntries = 64,
    private readonly key: (data: Uint8Array) => string = bytesKey,
  ) {}

  get stats(): SniffCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      bytes: this.heldBytes,
      entries: this.entries.size,
    };
  }

  /**
   * The result of `check` for `data`, from the cache when the same bytes were accepted before. A miss runs `check`
   * on a probe budget holding what `budget` has left (the whole render's budget without one, as much as one file may
   * take), so the result and the steps are the real check's, then copies the probe's outcome into `budget`.
   */
  sniff(data: Uint8Array, budget: EntropyBudget | undefined, check: SniffCheck): SniffResult {
    const key = this.key(data);
    const entry = this.entries.get(key);
    if (entry !== undefined && sameBytes(entry.data, data)) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, entry);
      return charged(entry, budget);
    }
    this.misses++;
    const probe = new EntropyBudget();
    probe.remaining = budget?.remaining ?? maxRenderEntropySteps;
    const before = probe.remaining;
    const result = check(data, probe);
    if (budget !== undefined) {
      budget.remaining = probe.remaining;
      budget.exhausted ||= probe.exhausted;
    }
    if (result.ok) this.store(key, data, result, before - probe.remaining);
    return result;
  }

  /**
   * Keeps `result` for `data` as if a check had taken `steps`: for bytes made from an image already checked (the copy
   * the renderer writes) whose result follows from that check. Refusals are not kept.
   */
  remember(data: Uint8Array, result: SniffResult, steps: number): void {
    if (result.ok) this.store(this.key(data), data, result, steps);
  }

  clear(): void {
    this.entries.clear();
    this.heldBytes = 0;
    this.hits = 0;
    this.misses = 0;
  }

  private store(key: string, data: Uint8Array, result: Accepted, steps: number): void {
    if (data.length > this.maxBytes) return;
    const old = this.entries.get(key);
    if (old !== undefined) {
      this.entries.delete(key);
      this.heldBytes -= old.data.length;
    }
    this.entries.set(key, { data: data.slice(), result: frozen(result.info), steps });
    this.heldBytes += data.length;
    for (const [oldest, entry] of this.entries) {
      if (this.heldBytes <= this.maxBytes && this.entries.size <= this.maxEntries) break;
      this.entries.delete(oldest);
      this.heldBytes -= entry.data.length;
    }
  }
}

/**
 * What the real check gives `budget` for the cached `entry`: within what is left, the entry's steps charged; past it,
 * the check would have stopped there, refused the image for the budget and spent it.
 */
function charged(entry: SniffEntry, budget: EntropyBudget | undefined): SniffResult {
  if (budget === undefined) return entry.result;
  if (entry.steps > budget.remaining) {
    budget.remaining = 0;
    budget.exhausted = true;
    return { ok: false, message: entropyRefusal("budget") };
  }
  budget.remaining -= entry.steps;
  return entry.result;
}

/** A deep-frozen copy of `info` as a result: every hit hands out the same object, so no caller can change it for the next. */
function frozen(info: ImageInfo): Accepted {
  const orientationFields = info.orientationFields.map((field) =>
    Object.freeze({
      ...field,
      entries: Object.freeze([...field.entries]),
      ...(field.checksum === undefined ? {} : { checksum: Object.freeze({ ...field.checksum }) }),
    }),
  );
  const colourData = info.colourData.map((range) => Object.freeze({ ...range }));
  return Object.freeze({
    ok: true,
    info: Object.freeze({
      ...info,
      orientationFields: Object.freeze(orientationFields),
      colourData: Object.freeze(colourData),
    }),
  });
}

/** The cache every render, raster pass and upload check of this module instance shares. */
export const sniffCache = new SniffCache();
