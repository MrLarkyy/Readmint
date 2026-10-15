import { RenderLimits } from "@readmint/renderer";
import { encodePng } from "./encodePng.js";
import { OutputBudget } from "./OutputBudget.js";
import type { RasterCodecs, RgbaImage } from "./RasterCodecs.js";
import { RasterError } from "./RasterError.js";
import { readWebp, stillWebp } from "./webpChunks.js";

const webpUri = /data:image\/webp;base64,([A-Za-z0-9+/]*={0,2})/g;

/**
 * The SVG with each WebP image swapped for a PNG of the same pixels, since the rasterizer cannot decode WebP; an
 * animated WebP becomes its first frame, as a still SVG renderer shows it. Only this copy changes, never the SVG
 * output. `cache` keeps each decoded image across the frames of one export.
 */
export function inlineWebpAssets(
  svg: string,
  codecs: RasterCodecs,
  cache: Map<string, string>,
): string {
  if (!svg.includes("data:image/webp")) return svg;
  return svg.replace(webpUri, (uri: string, base64: string) => {
    let png = cache.get(uri);
    if (png === undefined) {
      const image = firstFrame(new Uint8Array(Buffer.from(base64, "base64")), codecs);
      const bytes = encodePng(
        image.data,
        image.width,
        image.height,
        new OutputBudget(Number.POSITIVE_INFINITY, "PNG"),
      );
      png = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
      cache.set(uri, png);
    }
    return png;
  });
}

function firstFrame(bytes: Uint8Array, codecs: RasterCodecs): RgbaImage {
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
  if (image.kind === "still") return decode(bytes, image, codecs);
  const [frame] = image.frames;
  if (frame === undefined) throw new RasterError("raster-image", "a WebP animation has no frame");
  const pixels = decode(stillWebp(frame), frame, codecs);
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
  codecs: RasterCodecs,
): RgbaImage {
  const image = codecs.decodeWebp(bytes);
  if (image?.width !== size.width || image.height !== size.height) {
    throw new RasterError("raster-image", "a WebP image cannot be drawn: libwebp cannot decode it");
  }
  return image;
}
