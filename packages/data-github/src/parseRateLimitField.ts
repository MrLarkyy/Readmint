import type { RateLimitRecord } from "./GitHubRecords.js";
import type { ResponseReader } from "./ResponseReader.js";

/** The `rateLimit` object every Readmint query asks for next to its data. */
export function parseRateLimitField(data: ResponseReader): RateLimitRecord | null {
  const rateLimit = data.field("rateLimit").nullable();
  if (rateLimit === null) return null;
  return {
    cost: rateLimit.field("cost").count(),
    remaining: rateLimit.field("remaining").count(),
    resetAt: rateLimit.field("resetAt").timestamp(),
  };
}
