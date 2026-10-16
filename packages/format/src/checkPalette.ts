import type { Design } from "./Design.js";
import type { IssueCollector } from "./IssueCollector.js";
import { jsonPointer } from "./jsonPointer.js";
import { paletteReads } from "./paletteReads.js";
import { quoteInput } from "./quoteInput.js";

/**
 * Expression literals. `palette.true` would parse and read the token, but tokens follow the `let` name rules, so a
 * token is always a name an expression could also bind.
 */
const literals: ReadonlySet<string> = new Set(["true", "false", "null"]);

/** The top-level keys whose strings the renderer evaluates (a component's `layers` are handled apart). */
const evaluated: ReadonlySet<string> = new Set(["canvas", "styles", "layers", "animation"]);

/**
 * Checks the palette of a structurally valid design: every mode holds every token some mode defines, no token is an
 * expression literal, and every `palette.<token>` an expression of the design reads names a token. Only text the
 * renderer evaluates is scanned (canvas, styles, layers, animation, component layers); titles, descriptions, assets
 * and prop definitions are literal. A read is found lexically (`paletteReads`), so a computed key is not checked here; it reads `null` when rendering. Tokens live in
 * Maps only, so `__proto__` or `constructor` is a plain token. Document order is kept.
 */
export function checkPalette(design: Design, issues: IssueCollector): void {
  const palette = design.palette;
  if (palette === undefined) return;
  const tokens = new Map<string, string>();
  for (const mode of Object.keys(palette)) {
    for (const token of Object.keys(palette[mode] ?? {}))
      if (!tokens.has(token)) tokens.set(token, mode);
  }
  for (const mode of Object.keys(palette)) {
    const own = palette[mode] ?? {};
    const modePath = jsonPointer("/palette", mode);
    for (const token of Object.keys(own)) {
      if (issues.isFull()) return;
      if (!literals.has(token)) continue;
      issues.add({
        path: jsonPointer(modePath, token),
        code: "reserved-name",
        message: `${quoteInput(token)} is reserved and cannot be a palette token`,
      });
    }
    for (const [token, first] of tokens) {
      if (issues.isFull()) return;
      if (Object.hasOwn(own, token)) continue;
      issues.add({
        path: modePath,
        code: "missing-property",
        message: `missing token ${quoteInput(token)} (defined in mode ${quoteInput(first)})`,
      });
    }
  }
  for (const key of Object.keys(design)) {
    if (key === "components") {
      for (const name of Object.keys(design.components ?? {})) {
        const path = jsonPointer("/components", name);
        const layers = design.components?.[name]?.layers;
        checkReads(layers, jsonPointer(path, "layers"), tokens, issues);
      }
    } else if (evaluated.has(key)) {
      checkReads(design[key as keyof Design], jsonPointer("", key), tokens, issues);
    }
  }
}

/** Every string below `value` (depth is bounded by `DesignLimits.maxDepth` before validation runs). */
function checkReads(
  value: unknown,
  path: string,
  tokens: ReadonlyMap<string, string>,
  issues: IssueCollector,
): void {
  if (issues.isFull()) return;
  if (typeof value === "string") {
    for (const token of new Set(paletteReads(value))) {
      if (tokens.has(token)) continue;
      issues.add({
        path,
        code: "unknown-reference",
        message: `unknown palette token ${quoteInput(token)}`,
      });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item: unknown, index) => {
      checkReads(item, jsonPointer(path, index), tokens, issues);
    });
  } else if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    for (const key of Object.keys(record))
      checkReads(record[key], jsonPointer(path, key), tokens, issues);
  }
}
