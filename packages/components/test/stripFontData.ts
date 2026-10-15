/**
 * The animated SVG of a section with embedded font data replaced by its length: the file snapshots pin the structure
 * and the CSS, the golden suites pin the font embedding.
 */
export function stripFontData(svg: string): string {
  return svg.replace(
    /data:font\/(\w+);base64,[A-Za-z0-9+/=]+/gu,
    (match, type: string) => `data:font/${type};base64-length=${String(match.length)}`,
  );
}
