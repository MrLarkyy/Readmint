const JSON_TYPES = new Set(["application/json", "text/json", "text/plain"]);
const JSON_SUFFIX_TYPE = /^application\/[a-z0-9!#$&^_.+-]+\+json$/;
const SHOWN_LENGTH = 64;

/**
 * Why a `content-type` is not taken as JSON, or `undefined` when it is: a JSON type, a `+json`
 * type, or `text/plain` (raw.githubusercontent.com serves JSON as text), with no charset or UTF-8.
 * Refusing anything else stops an HTML error page or a login form from being parsed.
 */
export function checkMediaType(value: string | null): string | undefined {
  if (value === null || value.trim() === "") return "has no content type";
  const [essence = "", ...parameters] = value.split(";");
  const type = essence.trim().toLowerCase();
  if (!JSON_TYPES.has(type) && !JSON_SUFFIX_TYPE.test(type)) {
    return `has content type ${shown(type)}, not JSON`;
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
