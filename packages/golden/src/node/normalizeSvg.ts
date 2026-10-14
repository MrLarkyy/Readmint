import { createHash } from "node:crypto";

const tokenPattern =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;
const attributePattern = /([^\s=/>]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)')/g;
const valuePattern = /(data:[^)'"\s]*)|(#[\w-]+)|(-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
const urlPattern = /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g;
const digestedPattern = /^data:[^;,]*;sha256=[0-9a-f]{64}$/;
const untouched = new Set(["class", "font-family"]);

/**
 * Makes an SVG string comparable across runs: ids renamed in order of definition, numbers rounded,
 * data: URIs replaced by a digest. Text nodes stay as they are. The result is stable under a second pass.
 */
export function normalizeSvg(svg: string, precision = 3): string {
  const source = svg.replace(/\r\n?/g, "\n");
  const ids = collectIds(source);
  const withStyles = source.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g,
    (_all, open: string, css: string, close: string) => open + rewriteStyleText(css, ids) + close,
  );
  const normalized = withStyles.replace(tokenPattern, (token) =>
    normalizeTag(token, ids, precision),
  );
  return `${normalized.trimEnd()}\n`;
}

function collectIds(source: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const token of source.match(tokenPattern) ?? []) {
    if (!isElementStart(token)) continue;
    for (const attribute of token.matchAll(attributePattern)) {
      const id = attribute[3] ?? attribute[4] ?? "";
      if (attribute[1] === "id" && id !== "" && !ids.has(id)) ids.set(id, `id${String(ids.size)}`);
    }
  }
  return ids;
}

function isElementStart(token: string): boolean {
  return /^<[A-Za-z_:]/.test(token);
}

function normalizeTag(token: string, ids: Map<string, string>, precision: number): string {
  if (!isElementStart(token)) return token;
  return token.replace(
    attributePattern,
    (_all, name: string, equals: string, double?: string, single?: string) => {
      const quote = double === undefined ? "'" : '"';
      const value = normalizeAttribute(name, double ?? single ?? "", ids, precision);
      return `${name}${equals}${quote}${value}${quote}`;
    },
  );
}

function normalizeAttribute(
  name: string,
  value: string,
  ids: Map<string, string>,
  precision: number,
): string {
  const lower = name.toLowerCase();
  if (lower === "id") return ids.get(value) ?? value;
  if (lower === "href" || lower === "xlink:href") {
    if (value.startsWith("#")) return `#${ids.get(value.slice(1)) ?? value.slice(1)}`;
    return value.startsWith("data:") ? digestData(value) : value;
  }
  if (lower === "aria-labelledby" || lower === "aria-describedby") {
    return value
      .split(/\s+/)
      .map((token) => ids.get(token) ?? token)
      .join(" ");
  }
  if (untouched.has(lower) || lower.startsWith("xmlns") || lower.startsWith("xml:")) return value;
  let result = renameUrls(value, ids);
  if (lower === "begin" || lower === "end") result = renameTimingReferences(result, ids);
  return roundValue(result, precision);
}

function renameUrls(value: string, ids: Map<string, string>): string {
  return value.replace(
    urlPattern,
    (_all, quote: string, id: string) => `url(${quote}#${ids.get(id) ?? id}${quote})`,
  );
}

function renameTimingReferences(value: string, ids: Map<string, string>): string {
  return value.replace(
    /(^|[\s;+-])([A-Za-z_][\w-]*)(?=\.[A-Za-z])/g,
    (all, lead: string, id: string) => {
      const renamed = ids.get(id);
      return renamed === undefined ? all : lead + renamed;
    },
  );
}

function rewriteStyleText(css: string, ids: Map<string, string>): string {
  return renameUrls(css, ids)
    .replace(/#([A-Za-z_][\w-]*)(?=\s*[{,:.[>+~])/g, (all, id: string) => {
      const renamed = ids.get(id);
      return renamed === undefined ? all : `#${renamed}`;
    })
    .replace(/data:[^)'"\s&]*/g, (uri) => digestData(uri));
}

function roundValue(value: string, precision: number): string {
  return value.replace(valuePattern, (all, data?: string, hex?: string) => {
    if (data !== undefined) return digestData(data);
    if (hex !== undefined) return hex;
    return roundNumber(all, precision);
  });
}

function roundNumber(text: string, precision: number): string {
  const fixed = Number(text).toFixed(precision);
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed === "-0" || trimmed === "" ? "0" : trimmed;
}

function digestData(uri: string): string {
  if (digestedPattern.test(uri)) return uri;
  const mime = /^data:([^;,]*)/.exec(uri)?.[1] ?? "";
  return `data:${mime};sha256=${createHash("sha256").update(uri).digest("hex")}`;
}
