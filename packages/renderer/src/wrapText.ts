/**
 * Width of a string. Wrapping adds the widths of words and spaces, so kerning across a word boundary is left out
 * of the decision; the final layout of each line includes it.
 */
export type MeasureWidth = (text: string) => number;

/** The pieces a word too wide for a line may be broken into, in order (default: code points). */
export type SplitWord = (word: string) => readonly string[];

/** A hard line of the text (a bidi paragraph) and the lines it wraps into, as UTF-16 ranges of it. */
export interface WrappedParagraph {
  readonly text: string;
  readonly lines: readonly { readonly start: number; readonly end: number }[];
}

const BREAKABLE_SPACES = /([ \u2000-\u2006\u2008-\u200a\u205f\u3000])/u;

const codePoints: SplitWord = (word) => Array.from(word);

/** The lines of `wrapParagraphs` as strings. */
export function wrapText(
  text: string,
  width: number | undefined,
  measure: MeasureWidth,
  split: SplitWord = codePoints,
): string[] {
  return wrapParagraphs(text, width, measure, split).flatMap((paragraph) =>
    paragraph.lines.map((line) => paragraph.text.slice(line.start, line.end)),
  );
}

/**
 * Lines of a text: every line break is a hard break (a new paragraph); with a `width`, words (split at breakable
 * spaces: U+0020, U+2000-2006, U+2008-200A, U+205F, U+3000; the no-break spaces stay inside words) fill each line greedily and a word wider than the width breaks between the pieces `split` gives (clusters,
 * never inside one). The space at a soft break is dropped, every other space is kept.
 */
export function wrapParagraphs(
  text: string,
  width: number | undefined,
  measure: MeasureWidth,
  split: SplitWord = codePoints,
): WrappedParagraph[] {
  return text.split(/\r\n|\r|\n/u).map((paragraph) => ({
    text: paragraph,
    lines:
      width === undefined
        ? [{ start: 0, end: paragraph.length }]
        : wrapParagraph(paragraph, width, measure, split),
  }));
}

function wrapParagraph(
  paragraph: string,
  width: number,
  measure: MeasureWidth,
  split: SplitWord,
): { start: number; end: number }[] {
  const lines: { start: number; end: number }[] = [];
  const spaceWidths = new Map<string, number>();
  let start = 0;
  let end = 0;
  let lineWidth = 0;
  let started = false;
  let offset = 0;
  const parts = paragraph.split(BREAKABLE_SPACES);
  for (let index = 0; index < parts.length; index += 2) {
    const word = parts[index] ?? "";
    const separator = parts[index - 1] ?? "";
    const wordStart = offset;
    offset += word.length + 1;
    const wordWidth = measure(word);
    let space = spaceWidths.get(separator);
    if (space === undefined) {
      space = separator === "" ? 0 : measure(separator);
      spaceWidths.set(separator, space);
    }
    if (started && lineWidth + space + wordWidth <= width) {
      end = wordStart + word.length;
      lineWidth += space + wordWidth;
      continue;
    }
    if (started) lines.push({ start, end });
    started = true;
    if (wordWidth <= width) {
      start = wordStart;
      end = wordStart + word.length;
      lineWidth = wordWidth;
      continue;
    }
    start = wordStart;
    end = wordStart;
    lineWidth = 0;
    for (const piece of split(word)) {
      const pieceWidth = measure(piece);
      if (end > start && lineWidth + pieceWidth > width) {
        lines.push({ start, end });
        start = end;
        lineWidth = 0;
      }
      end += piece.length;
      lineWidth += pieceWidth;
    }
  }
  lines.push({ start, end });
  return lines;
}
