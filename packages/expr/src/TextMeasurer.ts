/**
 * Measures text as the renderer draws it, for the `textWidth` and `truncateWidth` filters. The renderer supplies it;
 * without one those filters fail. `font` is a font asset id of the design, `undefined` comes back when the design has
 * no such font. Widths are in pixels, each paragraph laid out on one line, the widest one.
 */
export interface TextMeasurer {
  width(text: string, font: string, size: number, letterSpacing: number): number | undefined;
  /** `text` when it fits `width`; else its longest run of whole clusters plus "…" that fits; "" when "…" does not. */
  truncate(
    text: string,
    width: number,
    font: string,
    size: number,
    letterSpacing: number,
  ): string | undefined;
}
