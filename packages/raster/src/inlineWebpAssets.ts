import { RenderLimits } from "@readmint/renderer";
import { decodeBase64, encodeBase64 } from "./base64.js";
import { encodePng } from "./encodePng.js";
import { OutputBudget } from "./OutputBudget.js";
import { RasterError } from "./RasterError.js";
import { readWebp } from "./readWebp.js";
import type { RgbaImage } from "./RgbaImage.js";
import type { WebpCodec } from "./WebpCodec.js";
import { stillWebp } from "./writeWebp.js";

/**
 * A WebP data URI as the `href` of an `<image>` element, where the renderer writes images. Text and attribute values
 * from a design or data are escaped (no `<` or `"`), so they can never form this.
 */
export const webpImageHref =
  /(<image\b[^>]*?\shref=")data:image\/webp;base64,([A-Za-z0-9+/]*={0,2})(")/g;

/** Whether the SVG draws a WebP image. */
export function hasWebpImage(svg: string): boolean {
  webpImageHref.lastIndex = 0;
  return webpImageHref.test(svg);
}

/**
 * The SVG with each WebP image swapped for a PNG of the same pixels, since the rasterizer cannot decode WebP; an
 * animated WebP becomes its first frame, as a still SVG renderer shows it. Only this copy changes, never the SVG
 * output. `cache` keeps each decoded image across the frames of one export.
 */
export function inlineWebpAssets(
  svg: string,
  codec: WebpCodec | undefined,
  cache: Map<string, string>,
): string {
  return svg.replace(webpImageHref, (_match, start: string, base64: string, end: string) => {
    let png = cache.get(base64);
    if (png === undefined) {
      if (codec === undefined) throw new Error("a WebP image needs the WebP codec");
      const decoded = decodeBase64(base64);
      if (decoded === undefined) {
        throw new RasterError(
          "raster-image",
          "a WebP image cannot be drawn: its base64 data is malformed",
        );
      }
      const image = firstFrame(decoded, codec);
      // Only resvg reads this PNG, at once: fast compression is enough.
      const bytes = encodePng(
        image.data,
        image.width,
        image.height,
        new OutputBudget(Number.POSITIVE_INFINITY, "PNG"),
        1,
      );
      png = `data:image/png;base64,${encodeBase64(bytes)}`;
      cache.set(base64, png);
    }
    return `${start}${png}${end}`;
  });
}

function firstFrame(bytes: Uint8Array, codec: WebpCodec): RgbaImage {
  if (bytes.length > RenderLimits.maxImageBytes) {
    throw new RasterError(
      "raster-image",
      `a WebP image holds ${String(bytes.length)} bytes, more than the ${String(RenderLimits.maxImageBytes)} allowed`,
    );
  }
  const image = readWebp(bytes, {
    maxSide: RenderLimits.maxImageSide,
    maxFrames: RenderLimits.maxAnimationFrames,
  });
  if (image.kind === "still") return decode(bytes, image, codec);
  const [frame] = image.frames;
  if (frame === undefined) throw new RasterError("raster-image", "a WebP animation has no frame");
  const pixels = decode(stillWebp(frame), frame, codec);
  // The first frame on a transparent canvas: blending over transparent pixels leaves the frame's own.
  const canvas = new Uint8Array(image.width * image.height * 4);
  for (let row = 0; row < frame.height; row++) {
    const from = row * frame.width * 4;
    canvas.set(
      pixels.data.subarray(from, from + frame.width * 4),
      ((frame.y + row) * image.width + frame.x) * 4,
    );
  }
  return { data: canvas, width: image.width, height: image.height };
}

function decode(
  bytes: Uint8Array,
  size: { readonly width: number; readonly height: number },
  codec: WebpCodec,
): RgbaImage {
  const image = codec.decodeWebp(bytes);
  if (image?.width !== size.width || image.height !== size.height) {
    throw new RasterError("raster-image", "a WebP image cannot be drawn: libwebp cannot decode it");
  }
  return image;
}
