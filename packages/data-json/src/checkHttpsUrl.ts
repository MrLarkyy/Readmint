import { JsonLimits } from "./JsonSourceOptions.js";

/**
 * Parses a URL source or a redirect target: https only, no user name or password, no whitespace
 * or control characters, at most `maxUrlLength`. Returns the URL, or why it is refused (never
 * quoting the URL, which may hold a key in its query).
 */
export function checkHttpsUrl(text: string): URL | string {
  if (text.length > JsonLimits.maxUrlLength) {
    return `is longer than ${String(JsonLimits.maxUrlLength)} characters`;
  }
  // eslint-disable-next-line no-control-regex -- control characters are what is refused here
  if (/[\s\u0000-\u001f\u007f]/.test(text)) return "contains whitespace or a control character";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "is not a valid URL";
  }
  if (url.protocol !== "https:") return "is not an https URL";
  if (url.username !== "" || url.password !== "") return "contains a user name or password";
  if (url.hostname === "") return "has no host";
  if (url.href.length > JsonLimits.maxUrlLength) {
    return `is longer than ${String(JsonLimits.maxUrlLength)} characters`;
  }
  return url;
}
