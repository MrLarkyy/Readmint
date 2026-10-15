import { timingSafeEqual } from "node:crypto";

/**
 * A single-use path `/<token>`: `take` is true for the first exact match only, so the address handed to a
 * browser opener (and visible in its command line) is worthless once the browser used it (or the secret address was).
 * After `take`, `reused` reports the first later exact match once, unless `discard` dropped the path (the owner
 * used the secret address, so a repeat is no news).
 */
export class LaunchPath {
  #path: Buffer | undefined;
  #state: "pending" | "taken" | "reported" = "pending";

  constructor(token: string) {
    this.#path = Buffer.from(`/${token}`);
  }

  /** Drops the launch path for good: the secret address has been used, so this one is no longer needed. */
  discard(): void {
    this.#path = undefined;
  }

  /** True once for exactly `/<token>` (a raw path without its query); a mismatch never spends it. */
  take(path: string): boolean {
    if (this.#state !== "pending" || !this.#matches(path)) return false;
    this.#state = "taken";
    return true;
  }

  /** True exactly once, for an exact match after `take` succeeded; a mismatch changes nothing. */
  reused(path: string): boolean {
    if (this.#state !== "taken" || !this.#matches(path)) return false;
    this.#state = "reported";
    return true;
  }

  #matches(path: string): boolean {
    const expected = this.#path;
    if (expected === undefined) return false;
    const bytes = Buffer.from(path);
    // The length is public; the bytes are compared in constant time.
    return bytes.length === expected.length && timingSafeEqual(bytes, expected);
  }
}
