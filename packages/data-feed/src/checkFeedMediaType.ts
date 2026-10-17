import { mediaTypeCheck } from "@readmint/data";

/**
 * Why a `content-type` is not taken as a feed, or `undefined` when it is: an XML type, a `+xml`
 * type (application/rss+xml, application/atom+xml, ...), or `text/plain` (raw file hosts serve
 * feeds as text), with no charset or UTF-8. Refusing anything else stops an HTML error page or a
 * login form from being parsed.
 */
export const checkFeedMediaType = mediaTypeCheck(
  new Set(["application/xml", "text/xml", "text/plain"]),
  "xml",
  "XML",
);
