import { parseSfnt } from "@readmint/fonts";
import { RenderLimits } from "@readmint/renderer";
import { unescapeCss } from "./cssText.js";
import { decodeWoff } from "./decodeWoff.js";
import { RasterError } from "./RasterError.js";
import type { RasterFont } from "./RasterFont.js";
import { unescapeXml } from "./xmlText.js";

const styleElement = /<style\b[^>]*>([\s\S]*?)<\/style>/g;
const fontFace = /@font-face\s*\{([^{}]*)\}/g;
const fontSource = /src\s*:\s*url\(\s*data:([^;,)\s]*)((?:;[^,)\s]*)?),([^)\s]*)\)/;
const faceFamily = /font-family\s*:\s*"((?:[^"\\]|\\.)*)"/;
const faceWeight = /font-weight\s*:\s*([0-9]{1,4})/;
const faceStyle = /font-style\s*:\s*(normal|italic|oblique)/;
const textElement = /<text[\s>]/;

/**
 * The fonts the rasterizer draws with: each font an `@font-face` rule of a `<style>` element embeds as a `data:` URI
 * (as the renderer writes them; escaped text and attribute values cannot form one), then the caller's. TTF and OTF
 * are drawn as they are, WOFF once decoded (`decodeWoff`); WOFF2, another format, a broken font, or text with no font
 * at all is a `raster-font` error, never blank text.
 */
export function rasterFonts(svg: string, extra: readonly Uint8Array[] = []): RasterFont[] {
  const fonts: RasterFont[] = [];
  for (const [, css = ""] of svg.matchAll(styleElement)) {
    for (const [, rule = ""] of unescapeXml(css).matchAll(fontFace)) {
      const source = fontSource.exec(rule);
      if (source === null) continue;
      const [, mime = "", parameters = "", payload = ""] = source;
      const label = `the embedded ${mime} font`;
      if (!parameters.endsWith(";base64")) {
        throw new RasterError("raster-font", `${label} is not base64 encoded`);
      }
      const bytes = sfntOf(new Uint8Array(Buffer.from(payload, "base64")), mime, label);
      const familyText = faceFamily.exec(rule)?.[1];
      fonts.push({
        bytes,
        family: internalFamily(bytes, label),
        ...(familyText === undefined
          ? {}
          : {
              face: {
                family: unescapeCss(familyText),
                weight: Number(faceWeight.exec(rule)?.[1] ?? 400),
                style: faceStyle.exec(rule)?.[1] ?? "normal",
              },
            }),
      });
    }
  }
  extra.forEach((font, index) => {
    const label = `font ${String(index + 1)}`;
    const bytes = sfntOf(font, "", label);
    fonts.push({ bytes, family: internalFamily(bytes, label) });
  });
  if (fonts.length === 0 && textElement.test(svg)) {
    throw new RasterError(
      "raster-font",
      "the design draws text but has no font to draw it with; add a font asset and use it in the text",
    );
  }
  return fonts;
}

function sfntOf(bytes: Uint8Array, mime: string, label: string): Uint8Array {
  const tag = bytes.length < 4 ? "" : String.fromCharCode(...bytes.subarray(0, 4));
  if (tag === "wOF2" || mime === "font/woff2") {
    throw new RasterError(
      "raster-font",
      `${label} is WOFF2, which raster export cannot draw yet; give the font asset as TTF, OTF or WOFF`,
    );
  }
  if (tag === "wOFF") return decodeWoff(bytes, RenderLimits.maxFontBytes, label);
  if (tag === "\0\x01\0\0" || tag === "OTTO" || tag === "true") return bytes;
  throw new RasterError("raster-font", `${label} is not a TTF, OTF or WOFF font`);
}

function internalFamily(bytes: Uint8Array, label: string): string {
  const parsed = parseSfnt(bytes);
  if (!parsed.ok) {
    throw new RasterError("raster-font", `${label} cannot be read: ${parsed.message}`);
  }
  return parsed.font.familyName;
}
