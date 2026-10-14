/** A colour as `#rrggbb` (lower case) and an alpha in [0, 1], the form every SVG consumer understands. */
export interface PaintColour {
  readonly hex: string;
  readonly alpha: number;
}

const pattern = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/u;

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`; undefined for anything else. */
export function parseColour(text: string): PaintColour | undefined {
  if (!pattern.test(text)) return undefined;
  const digits = text.slice(1).toLowerCase();
  const long = digits.length <= 4 ? digits.replace(/./gu, "$&$&") : digits;
  const alpha = long.length === 8 ? Number.parseInt(long.slice(6), 16) / 255 : 1;
  return { hex: `#${long.slice(0, 6)}`, alpha };
}
