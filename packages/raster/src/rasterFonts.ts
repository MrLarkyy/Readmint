import { RasterError } from "./RasterError.js";

const fontUri = /url\(\s*["']?data:([^;,)"'\s]*)((?:;[^,)"'\s]*)?),([^)"'\s]*)["']?\s*\)/g;
const textElement = /<text[\s>]/;

/**
 * The fonts the rasterizer draws with: each `data:` font the SVG embeds (`@font-face`, as the renderer writes them),
 * then the caller's. Only TTF and OTF are drawn; a WOFF or WOFF2 font, or text with no font at all, is a
 * `raster-font` error, never blank text.
 */
export function rasterFonts(svg: string, extra: readonly Uint8Array[] = []): Uint8Array[] {
  const fonts: Uint8Array[] = [];
  for (const [, mime = "", parameters = "", payload = ""] of svg.matchAll(fontUri)) {
    if (!mime.startsWith("font/") && !mime.startsWith("application/font")) continue;
    if (mime !== "font/ttf" && mime !== "font/otf") {
      throw new RasterError(
        "raster-font",
        `the SVG embeds a ${mime} font; raster export draws TTF and OTF fonts only, so give the font asset as TTF or OTF`,
      );
    }
    if (!parameters.endsWith(";base64")) {
      throw new RasterError("raster-font", "the SVG embeds a font that is not base64 encoded");
    }
    fonts.push(checked(new Uint8Array(Buffer.from(payload, "base64")), "an embedded font"));
  }
  extra.forEach((font, index) => fonts.push(checked(font, `font ${String(index + 1)}`)));
  if (fonts.length === 0 && textElement.test(svg)) {
    throw new RasterError(
      "raster-font",
      "the design draws text but has no TTF or OTF font to draw it with; add a font asset and use it in the text",
    );
  }
  return fonts;
}

function checked(font: Uint8Array, label: string): Uint8Array {
  const tag = font.length < 4 ? "" : String.fromCharCode(...font.subarray(0, 4));
  if (tag === "\0\x01\0\0" || tag === "OTTO" || tag === "true") return font;
  throw new RasterError("raster-font", `${label} is not a TTF or OTF font`);
}
