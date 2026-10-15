import { timingSafeEqual } from "node:crypto";

/**
 * A single-use path `/<token>`: `take` is true for the first exact match only, so the address handed to a
 * browser opener (and visible in its command line) is worthless once the browser used it.
 */
export class LaunchPath {
  #path: Buffer | undefined;

  constructor(token: string) {
    this.#path = Buffer.from(`/${token}`);
  }

  /** True once for exactly `/<token>` (a raw path without its query); a mismatch never spends it. */
  take(path: string): boolean {
    const expected = this.#path;
    if (expected === undefined) return false;
    const bytes = Buffer.from(path);
    // The length is public; the bytes are compared in constant time.
    if (bytes.length !== expected.length || !timingSafeEqual(bytes, expected)) return false;
    this.#path = undefined;
    return true;
  }
}
