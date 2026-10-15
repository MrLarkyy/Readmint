import { quoteForLog } from "./quoteForLog.js";
import { RemoteImageError } from "./RemoteImageError.js";
import { RemoteImageLimits } from "./RemoteImageOptions.js";

/**
 * The URL an image may be fetched from: https, no user name, password or port, and a host name exactly on
 * `allowedHosts` (compared as `URL` normalises it: lower case, punycode), so `<allowed>.evil.example` or
 * `evil.example?<allowed>` never pass. Throws `RemoteImageError` (`image-url`, `image-host`).
 */
export function checkImageUrl(value: string, allowedHosts: readonly string[]): URL {
  if (value.length > RemoteImageLimits.maxUrlLength) {
    throw new RemoteImageError(
      "image-url",
      `the URL is longer than ${String(RemoteImageLimits.maxUrlLength)} characters`,
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteImageError("image-url", `${quoteForLog(value)} is not a URL`);
  }
  if (url.protocol !== "https:") {
    throw new RemoteImageError("image-url", `${quoteForLog(value)} is not an https URL`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new RemoteImageError("image-url", `${quoteForLog(value)} holds a user name or password`);
  }
  if (url.port !== "") {
    throw new RemoteImageError("image-url", `${quoteForLog(value)} names a port`);
  }
  if (!allowedHosts.includes(url.hostname)) {
    throw new RemoteImageError(
      "image-host",
      `${quoteForLog(value)}: host ${quoteForLog(url.hostname)} is not allowed (allowed: ${allowedHosts.join(", ")})`,
    );
  }
  return url;
}
