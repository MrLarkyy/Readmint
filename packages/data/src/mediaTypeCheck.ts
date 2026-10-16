const SHOWN_LENGTH = 64;

/**
 * Builds the `content-type` check of a text source: why a value is not taken as `kind` (`undefined` when it is). It
 * accepts the listed `types` and any `application/*+<suffix>` type, with no charset or UTF-8, so an HTML error page
 * or a login form is never parsed. Quoted parts are cut and made printable.
 */
export function mediaTypeCheck(
  types: ReadonlySet<string>,
  suffix: string,
  kind: string,
): (value: string | null) => string | undefined {
  const suffixType = new RegExp(`^application/[a-z0-9!#$&^_.+-]+[+]${suffix}$`);
  return (value) => {
    if (value === null || value.trim() === "") return "has no content type";
    const [essence = "", ...parameters] = value.split(";");
    const type = essence.trim().toLowerCase();
    if (!types.has(type) && !suffixType.test(type)) {
      return `has content type ${shown(type)}, not ${kind}`;
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
  };
}

function shown(text: string): string {
  return `"${text.slice(0, SHOWN_LENGTH).replace(/[^\x20-\x7e]|"/g, "?")}"`;
}
