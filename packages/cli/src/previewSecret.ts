import { randomBytes } from "node:crypto";

/**
 * A new per-session secret for the preview's path: 256 random bits as 43 base64url characters.
 * Made once per run and kept in memory only; never written to disk.
 */
export function previewSecret(): string {
  return randomBytes(32).toString("base64url");
}
