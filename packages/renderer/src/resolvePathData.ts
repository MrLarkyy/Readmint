import { isPathTemplate, PathData, type PathLayer } from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { evaluateText } from "./expressions.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";

/** Whitespace the format's `\s` accepts but SVG path data does not (VT, FF, NBSP, U+2028, U+FEFF, ...). */
const nonSvgWhitespace = /[^\S \t\n\r]/gu;

const pathData = new RegExp(PathData.pattern, "u");

/**
 * The path data a layer writes. A literal `d` is taken as validated; a template is evaluated as text in the copy's
 * scope and held to the rules the format holds a literal to, so what it gives can never end the attribute. Whitespace
 * SVG does not know becomes a space: one UTF-16 unit for one, so the data keeps its meaning, its bounds and its
 * reserved length.
 */
export function resolvePathData(
  context: RenderContext,
  layer: PathLayer,
  path: string,
  scope: Scope,
): string {
  if (!isPathTemplate(layer.d)) return layer.d.replace(nonSvgWhitespace, " ");
  const dPath = pointer(path, "d");
  const d = evaluateText(context, layer.d, dPath, scope);
  // The message never quotes the result: it holds values read from the data.
  if (d.length === 0) context.fail(dPath, "range", "the path data template gives no path data");
  if (d.length > PathData.maxLength) {
    context.fail(
      dPath,
      "range",
      `the path data template gives ${String(d.length)} characters; at most ${String(PathData.maxLength)} are allowed`,
    );
  }
  if (!pathData.test(d)) {
    context.fail(
      dPath,
      "range",
      "the path data template gives a character outside SVG path data (commands, numbers, separators)",
    );
  }
  return d.replace(nonSvgWhitespace, " ");
}
