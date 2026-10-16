import { cutToWidth, ellipsis } from "./cutToWidth.js";
import type { ShapedLine, TextShaper } from "./TextShaper.js";
import { wrapParagraphs } from "./wrapText.js";

/** Shaped lines with the widest line's width and the text they draw. */
export interface ShapedLines {
  readonly lines: readonly ShapedLine[];
  readonly widest: number;
  /** The content, or with lines left out by `maxLines` its part up to the last drawn line's cut. */
  readonly text: string;
}

/**
 * The lines of a text wrapped to `width` (undefined: each paragraph on one line) and shaped, with the widest line's
 * width. Drawing (`resolveText`) and measuring (`textWidth`) both lay text out here, so their widths agree.
 *
 * With `maxLines`, at most that many lines (soft-wrapped and hard) are kept. When lines are left out, the last kept
 * line becomes its own text followed by `…`, cut between clusters to fit `width` (`cutToWidth`, as `truncateWidth`
 * cuts; without a width the `…` is appended); it is laid out on its own and never wrapped again, since wrapping sums
 * word widths and could break it anew.
 */
export function shapeLines(
  shaper: TextShaper,
  content: string,
  width: number | undefined,
  maxLines?: number,
): ShapedLines {
  const paragraphs = wrapParagraphs(
    content,
    width,
    (text) => shaper.measure(text),
    (word) => shaper.clusters(word),
  );
  const limit = maxLines ?? Number.POSITIVE_INFINITY;
  const lines: ShapedLine[] = [];
  let text = content;
  let offset = 0;
  for (const [index, paragraph] of paragraphs.entries()) {
    if (lines.length >= limit) break;
    const bidi = shaper.paragraph(paragraph.text);
    for (const [number, line] of paragraph.lines.entries()) {
      const last = lines.length === limit - 1;
      const more = number < paragraph.lines.length - 1 || index < paragraphs.length - 1;
      if (!last || !more) {
        lines.push(shaper.layout(paragraph.text, bidi, line.start, line.end));
        continue;
      }
      const own = paragraph.text.slice(line.start, line.end);
      const cut =
        width === undefined
          ? own + ellipsis
          : cutToWidth(shaper, own, width, (part) => shaper.measure(part), true);
      lines.push(shaper.layout(cut, shaper.paragraph(cut), 0, cut.length));
      text = content.slice(0, offset + line.start) + cut;
      break;
    }
    offset +=
      paragraph.text.length + (content.startsWith("\r\n", offset + paragraph.text.length) ? 2 : 1);
  }
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, line.width);
  return { lines, widest, text };
}
