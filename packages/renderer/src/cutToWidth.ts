import type { TextShaper } from "./TextShaper.js";

export const ellipsis = "…";

/**
 * The longest prefix of whole clusters of `text` that, followed by `…`, is at most `width` wide by `measure`. A text
 * that fits keeps its own form unless `forced` (a line cap always marks the lines it leaves out). A cut drops the
 * whitespace it ends on, so the ellipsis follows a word (`Visual…`, not `Visual …`). An ellipsis wider than the width
 * alone gives "". Lays out at most `cutProbes(text.length)` texts.
 */
export function cutToWidth(
  shaper: TextShaper,
  text: string,
  width: number,
  measure: (part: string) => number,
  forced: boolean,
): string {
  if (forced) {
    const marked = text.trimEnd() + ellipsis;
    if (measure(marked) <= width) return marked;
  } else if (measure(text) <= width) {
    return text;
  }
  if (measure(ellipsis) > width) return "";
  const clusters = shaper.clusters(text);
  const prefix = (count: number) => clusters.slice(0, count).join("").trimEnd() + ellipsis;
  // Bisection over whole clusters: `fits` holds a count that fits, `over` one that does not (the whole text).
  let fits = 0;
  let over = clusters.length;
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (measure(prefix(middle)) <= width) fits = middle;
    else over = middle;
  }
  return prefix(fits);
}

/** Texts a cut lays out: the whole text, the ellipsis, one per halving of its clusters, one spare. */
export function cutProbes(length: number): number {
  return 35 - Math.clz32(length);
}
