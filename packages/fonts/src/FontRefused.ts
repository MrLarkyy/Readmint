/**
 * Thrown for a font this version will not read (`unsupported`) or one that declares or decompresses to more bytes
 * than allowed (`too-large`); `parseSfnt` turns it into a result of that kind.
 */
export class FontRefused extends Error {
  constructor(
    readonly kind: "unsupported" | "too-large",
    message: string,
  ) {
    super(message);
  }

  static tooLarge(bytes: number, maxBytes: number): FontRefused {
    return new FontRefused(
      "too-large",
      `the font decompresses to ${String(bytes)} bytes, more than the ${String(maxBytes)} allowed`,
    );
  }
}
