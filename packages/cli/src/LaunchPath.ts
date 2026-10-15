import { timingSafeEqual } from "node:crypto";

/**
 * A single-use path `/<token>`: `take` is true for the first exact match only, so the address handed to a
 * browser opener (and visible in its command line) is worthless once the browser used it (or the secret address was).
 * Once the path is spent (taken or discarded), `reused` reports the first exact match once: whoever asks for it
 * later may be the owner, locked out by someone who got in first.
 */
export class LaunchPath {
  readonly #path: Buffer;
  #state: "pending" | "spent" | "reported" = "pending";

  constructor(token: string) {
    this.#path = Buffer.from(`/${token}`);
  }

  /** Spends the launch path: the secret address has been used, so `take` refuses it from now on. */
  discard(): void {
    if (this.#state === "pending") this.#state = "spent";
  }

  /** True once for exactly `/<token>` (a raw path without its query); a mismatch never spends it. */
  take(path: string): boolean {
    if (this.#state !== "pending" || !this.#matches(path)) return false;
    this.#state = "spent";
    return true;
  }

  /** True exactly once, for an exact match once the path is spent (taken or discarded); a mismatch changes nothing. */
  reused(path: string): boolean {
    if (this.#state !== "spent" || !this.#matches(path)) return false;
    this.#state = "reported";
    return true;
  }

  #matches(path: string): boolean {
    const expected = this.#path;
    const bytes = Buffer.from(path);
    // The length is public; the bytes are compared in constant time.
    return bytes.length === expected.length && timingSafeEqual(bytes, expected);
  }
}
