import { decodeWoff } from "@readmint/fonts";

const fontFace = /url\(data:font\/woff;base64,([A-Za-z0-9+/=]+)\)/gu;

/**
 * The fonts an SVG embeds, as TrueType/OpenType bytes: every `@font-face` WOFF data URI decoded. resvg reads no
 * `@font-face`, so golden suites whose texts write shaped glyphs as the subsets' private-use characters let resvg draw
 * them from these (`fontsFromSvg`), exactly as Chromium draws them from the embedded subsets.
 */
export function embeddedFonts(svg: string): Uint8Array[] {
  return [...svg.matchAll(fontFace)].map((match) =>
    decodeWoff(
      Uint8Array.from(atob(match[1] ?? ""), (char) => char.charCodeAt(0)),
      16_777_216,
    ),
  );
}
