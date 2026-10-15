import { randomBytes } from "node:crypto";

const secretBytes = 32;
/** Characters of a `previewSecret()` (base64url without padding). */
export const previewSecretLength = Math.ceil((secretBytes * 4) / 3);

/**
 * A new per-session secret for the preview's path: 256 random bits as 43 base64url characters.
 * Made once per run and kept in memory only; never written to disk.
 */
export function previewSecret(): string {
  return randomBytes(secretBytes).toString("base64url");
}
