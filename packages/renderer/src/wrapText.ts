/**
 * Width of a string. Wrapping adds the widths of words and spaces, so kerning across a word boundary is left out
 * of the decision; the final layout of each line includes it.
 */
export type MeasureWidth = (text: string) => number;

/**
 * Lines of a text: every line break is a hard break; with a `width`, words (split at single spaces) fill each line
 * greedily and a word wider than the width breaks between code points. The space at a soft break is dropped, every
 * other space is kept.
 */
export function wrapText(text: string, width: number | undefined, measure: MeasureWidth): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/u)) {
    if (width === undefined) lines.push(paragraph);
    else wrapParagraph(paragraph, width, measure, lines);
  }
  return lines;
}

function wrapParagraph(
  paragraph: string,
  width: number,
  measure: MeasureWidth,
  lines: string[],
): void {
  const space = measure(" ");
  let line = "";
  let lineWidth = 0;
  let started = false;
  for (const word of paragraph.split(" ")) {
    const wordWidth = measure(word);
    if (started && lineWidth + space + wordWidth <= width) {
      line += ` ${word}`;
      lineWidth += space + wordWidth;
      continue;
    }
    if (started) lines.push(line);
    started = true;
    if (wordWidth <= width) {
      line = word;
      lineWidth = wordWidth;
      continue;
    }
    line = "";
    lineWidth = 0;
    for (const char of word) {
      const charWidth = measure(char);
      if (line !== "" && lineWidth + charWidth > width) {
        lines.push(line);
        line = "";
        lineWidth = 0;
      }
      line += char;
      lineWidth += charWidth;
    }
  }
  lines.push(line);
}
