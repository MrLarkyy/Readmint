import type { ShapedLine, TextShaper } from "./TextShaper.js";
import { wrapParagraphs } from "./wrapText.js";

/**
 * The lines of a text wrapped to `width` (undefined: each paragraph on one line) and shaped, with the widest line's
 * width. Drawing (`resolveText`) and measuring (`textWidth`) both lay text out here, so their widths agree.
 */
export function shapeLines(
  shaper: TextShaper,
  content: string,
  width: number | undefined,
): { readonly lines: readonly ShapedLine[]; readonly widest: number } {
  const paragraphs = wrapParagraphs(
    content,
    width,
    (text) => shaper.measure(text),
    (word) => shaper.clusters(word),
  );
  const lines = paragraphs.flatMap((paragraph) => {
    const bidi = shaper.paragraph(paragraph.text);
    return paragraph.lines.map((line) => shaper.layout(paragraph.text, bidi, line.start, line.end));
  });
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, line.width);
  return { lines, widest };
}
