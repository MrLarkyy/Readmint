import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSfnt, type SfntFont } from "../src/index.js";

export const fontsDir = join(import.meta.dirname, "..", "..", "renderer", "test", "fonts");

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fontsDir, name)));
}

/** Montserrat Medium 8.000 (TTF) and 7.222 (OTF, WOFF and WOFF2 of the same TTF); see the fonts README. */
export const montserrat = {
  ttf: load("Montserrat-Medium.ttf"),
  otf: load("Montserrat-Medium.otf"),
  woff: load("Montserrat-Medium.woff"),
  woff2: load("Montserrat-Medium.woff2"),
};

/** Noto Naskh Arabic 2.021 and Noto Sans Devanagari 2.007, subsets with every layout table; see the fonts README. */
export const noto = {
  arabic: load("NotoNaskhArabic-Regular.ttf"),
  devanagari: load("NotoSansDevanagari-Regular.ttf"),
};

export function parse(bytes: Uint8Array): SfntFont {
  const result = parseSfnt(bytes);
  if (!result.ok) throw new Error(result.message);
  return result.font;
}

export function sameBytes(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

/** Code points of a font's cmap within the BMP and the first astral plane. */
export function mappedCodePoints(font: SfntFont): number[] {
  const found: number[] = [];
  for (let codePoint = 0; codePoint < 0x20000; codePoint++) {
    if (font.glyphFor(codePoint) !== 0) found.push(codePoint);
  }
  return found;
}
