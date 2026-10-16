const FEED_TYPES = new Set(["application/xml", "text/xml", "text/plain"]);
// application/rss+xml, application/atom+xml and every other +xml type.
const XML_SUFFIX_TYPE = /^application\/[a-z0-9!#$&^_.+-]+\+xml$/;
const SHOWN_LENGTH = 64;

/**
 * Why a `content-type` is not taken as a feed, or `undefined` when it is: an XML type, a `+xml`
 * type, or `text/plain` (raw file hosts serve feeds as text), with no charset or UTF-8. Refusing
 * anything else stops an HTML error page or a login form from being parsed.
 */
export function checkFeedMediaType(value: string | null): string | undefined {
  if (value === null || value.trim() === "") return "has no content type";
  const [essence = "", ...parameters] = value.split(";");
  const type = essence.trim().toLowerCase();
  if (!FEED_TYPES.has(type) && !XML_SUFFIX_TYPE.test(type)) {
    return `has content type ${shown(type)}, not XML`;
  }
  for (const parameter of parameters) {
    const [key = "", raw = ""] = parameter.split("=", 2);
    if (key.trim().toLowerCase() !== "charset") continue;
    const charset = raw
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .toLowerCase();
    if (charset !== "utf-8" && charset !== "utf8") {
      return `has charset ${shown(charset)}, not UTF-8`;
    }
  }
  return undefined;
}

function shown(text: string): string {
  return `"${text.slice(0, SHOWN_LENGTH).replace(/[^\x20-\x7e]|"/g, "?")}"`;
}
