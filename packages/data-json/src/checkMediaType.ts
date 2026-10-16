import { mediaTypeCheck } from "@readmint/data";

/**
 * Why a `content-type` is not taken as JSON, or `undefined` when it is: a JSON type, a `+json`
 * type, or `text/plain` (raw.githubusercontent.com serves JSON as text), with no charset or UTF-8.
 * Refusing anything else stops an HTML error page or a login form from being parsed.
 */
export const checkMediaType = mediaTypeCheck(
  new Set(["application/json", "text/json", "text/plain"]),
  "json",
  "JSON",
);
