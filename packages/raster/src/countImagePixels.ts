import { decodeBase64, EntropyBudget, RenderLimits, sniffImage } from "@readmint/renderer";
import { RasterError } from "./RasterError.js";

/** What drawing the images of an SVG decodes, frame after frame. */
export interface ImageWork {
  /** Pixels resvg and libwebp decode over the whole export. */
  readonly pixels: number;
  /** `<image>` elements with a `data:` image. */
  readonly images: number;
  /** Times an image is drawn in one frame, every `<use>` of a shared image counted. */
  readonly draws: number;
}

const imageElement = /<image\b[^>]*>/g;
const symbolElement = /<symbol\b[^>]*\sid="([^"]*)"[^>]*>([\s\S]*?)<\/symbol>/g;
const defsElement = /<defs\b[^>]*>[\s\S]*?<\/defs>/g;
const useReference = /<use\b[^>]*\shref="#([^"]*)"/g;
const idAttribute = /\sid="([^"]*)"/;
const dataHref = /\shref="data:([^;,"]*);base64,([A-Za-z0-9+/]*={0,2})"/;

/**
 * The decoding work of the SVG's images over `frames` frames, without decoding any: each `data:` image's size from
 * its header (`sniffImage`), times its draws per frame (an inline image once; an image in `<defs>` as often as `<use>`
 * reaches it, through the `<symbol>`s the renderer shares images with), times the frames, plus one decode of each
 * distinct WebP image for the swap to PNG. resvg decodes an image on every draw, so a design that shares one large
 * image a thousand times stays a small SVG but is a thousand decodes.
 */
export function countImagePixels(svg: string, frames: number): ImageWork {
  const defs = [...svg.matchAll(defsElement)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
  const inDefs = (at: number): boolean =>
    defs.some(([start = 0, end = 0]) => at > start && at < end);
  const symbols = [...svg.matchAll(symbolElement)];
  const inSymbol = (at: number): boolean =>
    symbols.some((match) => at > match.index && at < match.index + match[0].length);
  const topUses = new Map<string, number>();
  for (const match of svg.matchAll(useReference)) {
    if (inSymbol(match.index)) continue;
    const id = match[1] ?? "";
    topUses.set(id, (topUses.get(id) ?? 0) + 1);
  }
  const symbolUses = symbols.map((match) => ({
    id: match[1] ?? "",
    references: [...(match[2] ?? "").matchAll(useReference)].map((use) => use[1] ?? ""),
  }));
  const memo = new Map<string, number>();
  const drawsOf = (id: string, depth: number): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    let draws = topUses.get(id) ?? 0;
    // Symbols nest a level or two in practice; a deeper chain (or a cycle) draws nothing more.
    if (depth < 8) {
      for (const symbol of symbolUses) {
        const count = symbol.references.filter((reference) => reference === id).length;
        if (count > 0) draws += count * drawsOf(symbol.id, depth + 1);
      }
    }
    memo.set(id, draws);
    return draws;
  };
  let pixels = 0;
  let images = 0;
  let totalDraws = 0;
  const webp = new Set<string>();
  // One JPEG symbol-check budget for every image of the export, as the render has. A JPEG the render already checked
  // comes from the renderer's sniff cache, charged the same steps, so it is not checked again.
  const budget = new EntropyBudget();
  for (const match of svg.matchAll(imageElement)) {
    const element = match[0];
    const source = dataHref.exec(element);
    if (source === null) continue;
    const [, mime = "", base64 = ""] = source;
    const decoded = decodeBase64(base64);
    if (decoded === undefined) {
      throw new RasterError(
        "raster-image",
        "an image cannot be drawn: its base64 data is malformed",
      );
    }
    const sniffed = sniffImage(decoded, RenderLimits.maxAnimationFrames, budget);
    if (!sniffed.ok && budget.exhausted) {
      throw new RasterError(
        "raster-too-many-image-pixels",
        `${EntropyBudget.message()}; draw fewer JPEG images or simpler ones`,
      );
    }
    if (!sniffed.ok) {
      throw new RasterError("raster-image", `an image cannot be drawn: ${sniffed.message}`);
    }
    const size = sniffed.info.width * sniffed.info.height;
    const id = idAttribute.exec(element)?.[1];
    const draws = (inDefs(match.index) ? 0 : 1) + (id === undefined ? 0 : drawsOf(id, 0));
    images++;
    totalDraws += draws;
    pixels += size * draws * frames;
    if (mime === "image/webp" && !webp.has(base64)) {
      webp.add(base64);
      pixels += size;
    }
  }
  return { pixels, images, draws: totalDraws };
}
