import { FeedLimits } from "./FeedSourceOptions.js";

/**
 * A link resolved against `base`, the feed URL as given (not a redirect target, so the same input
 * gives the same data) without its query, or `""`: only http and https links without credentials,
 * at most `linkLength` characters. A `javascript:` or `data:` link never reaches a design.
 */
export function feedLink(text: string, base: URL): string {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > FeedLimits.linkLength) return "";
  let url: URL;
  try {
    url = new URL(trimmed, base);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.username !== "" || url.password !== "") return "";
  return url.href.length > FeedLimits.linkLength ? "" : url.href;
}
