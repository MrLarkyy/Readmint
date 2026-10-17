import { frameTimes } from "@readmint/renderer";
import { samePixels } from "./changedRect.js";
import { countImagePixels } from "./countImagePixels.js";
import { encodeApng } from "./encodeApng.js";
import { encodeGif } from "./encodeGif.js";
import { encodePng } from "./encodePng.js";
import { encodeWebp, encodeWebpStill } from "./encodeWebp.js";
import { fitFrameRate } from "./fitFrameRate.js";
import type { FrameEncoder } from "./FrameEncoder.js";
import { type DelayUnit, frameDelays, type TimedFrame } from "./frameDelays.js";
import { frameFits } from "./frameFits.js";
import { loadRaster, openWebpCodec } from "./rasterRuntime.js";
import { hasWebpImage, inlineWebpAssets } from "./inlineWebpAssets.js";
import { matchFontFamilies } from "./matchFontFamilies.js";
import { OutputBudget } from "./OutputBudget.js";
import { RasterError } from "./RasterError.js";
import { RateProjection } from "./RateProjection.js";
import { type RasterFormat, rasterFormats } from "./RasterFormat.js";
import type { RasterInput } from "./RasterInput.js";
import { RasterLimits } from "./RasterLimits.js";
import type { RasterOptions } from "./RasterOptions.js";
import type { RasterOutput } from "./RasterOutput.js";
import { rasterFonts } from "./rasterFonts.js";
import { rasterizeFrame } from "./rasterizeFrame.js";
import type { Timeline } from "./Timeline.js";
import type { WebpCodec } from "./WebpCodec.js";

const defaultScale = 2;
const defaultFrameRate = 30;
const defaultGifFrameRate = 25;
/** GIF delays are whole centiseconds and players stretch anything under 2 to 10. */
const maxGifFrameRate = 50;
/** Latest frame time the renderer takes (`RenderOptions.time`). */
const maxTime = 86_400_000;

const units: Readonly<Record<RasterFormat, DelayUnit>> = {
  png: { ms: 1, min: 1 },
  apng: { ms: 1, min: 1 },
  webp: { ms: 1, min: 1 },
  gif: { ms: 10, min: 2 },
};

const labels: Readonly<Record<RasterFormat, string>> = {
  png: "PNG",
  apng: "APNG",
  webp: "WebP",
  gif: "GIF",
};

const mimeTypes: Readonly<Record<RasterFormat, string>> = {
  png: "image/png",
  apng: "image/apng",
  webp: "image/webp",
  gif: "image/gif",
};

interface Settings {
  readonly format: RasterFormat;
  readonly scale: number;
  /** The rate asked for; undefined = the default, lowered to fit the limits. */
  readonly frameRate: number | undefined;
  readonly time: number | undefined;
  readonly quality: number | undefined;
  readonly limits: RasterLimits;
}

/**
 * Rasterizes the renderer's SVG into a PNG, WebP, APNG or GIF that matches resvg's drawing of the same SVG. A design
 * with a timeline (and no `time`) becomes an animated WebP, APNG or GIF sampled at `frameRate`, by default the highest
 * whole rate up to 30 (GIF 25) whose frames fit the limits; a still design, one frame of it, or any design as `png`, a
 * still image (PNG for `apng`). WebP is lossless unless `quality` asks for lossy frames. Every limit that can be known
 * in advance (side, duration, frames, total pixels) is
 * checked before the first frame is drawn, the output size while encoding; any failure is a `RasterError` and
 * nothing is returned, except a call before the rasterizer was loaded (`initRaster`), which, once the input has
 * passed those checks, throws a plain `Error`. Same input, same bytes.
 */
export async function exportRaster(
  input: RasterInput,
  options: RasterOptions,
): Promise<RasterOutput> {
  const settings = resolveSettings(options);
  const { format, limits } = settings;
  // `png` is always a still image: the animated one is `apng`.
  const animation: Timeline | undefined =
    input.animation === undefined || settings.time !== undefined || format === "png"
      ? undefined
      : { duration: input.animation.duration, loop: input.animation.loop !== false };
  if (animation !== undefined && animation.duration > limits.maxDuration) {
    throw new RasterError(
      "raster-too-long",
      `the animation lasts ${String(animation.duration)} ms, more than the ${String(limits.maxDuration)} ms allowed; shorten the design's animation duration`,
    );
  }
  // A still image of an animated design shows `time`, else the start of its timeline.
  const first = input.frame(
    animation !== undefined
      ? 0
      : input.animation === undefined
        ? settings.time
        : (settings.time ?? 0),
  );
  const size = svgSize(first);
  // resvg's own sizing: the SVG size rounded up to whole pixels, then zoomed and rounded.
  const width = Math.round(Math.ceil(size.width) * settings.scale);
  const height = Math.round(Math.ceil(size.height) * settings.scale);
  checkSide(settings, width, height);
  const unit = units[format];
  let fits: ((frames: number) => boolean) | undefined;
  let frameRate = 0;
  let frameRateFitted = false;
  if (animation !== undefined) {
    const imageBase = countImagePixels(first, 0).pixels;
    const imagePerFrame = countImagePixels(first, 1).pixels - imageBase;
    fits = frameFits(limits, width, height, imageBase, imagePerFrame);
    if (settings.frameRate === undefined) {
      const wanted = format === "gif" ? defaultGifFrameRate : defaultFrameRate;
      // When not even 1 fps fits, the checks below fail at 1 fps with their usual message.
      frameRate = fitFrameRate(animation, wanted, unit, fits) ?? 1;
      frameRateFitted = frameRate < wanted;
    } else {
      frameRate = settings.frameRate;
    }
  }
  const plan: TimedFrame[] =
    animation === undefined
      ? [{ time: settings.time ?? 0, delay: 0 }]
      : frameDelays(frameTimes(animation, frameRate), animation, frameRate, unit);
  const lowerRate = (): number | undefined =>
    animation === undefined || fits === undefined
      ? undefined
      : fitFrameRate(animation, frameRate - 1, unit, fits);
  checkPlan(settings, width, height, plan.length, frameRate, lowerRate);
  checkImageWork(limits, countImagePixels(first, plan.length), plan.length, lowerRate);
  const fonts = rasterFonts(first, input.fonts);
  const buffers = fonts.map((font) => font.bytes);
  await loadRaster();
  const codecs = format === "webp" || hasWebpImage(first) ? await openWebpCodec() : undefined;
  const budget = new OutputBudget(
    limits.maxOutputBytes,
    labels[format],
    format === "webp" && settings.quality === undefined
      ? ", or give a WebP quality (1..100) for lossy frames"
      : "",
  );
  const webpCache = new Map<string, string>();
  const draw = (svg: string): Uint8Array => {
    const prepared = matchFontFamilies(inlineWebpAssets(svg, codecs, webpCache), fonts);
    const image = rasterizeFrame(prepared, settings.scale, buffers);
    if (image.width !== width || image.height !== height) {
      throw new RasterError(
        "raster-image",
        `a frame is ${String(image.width)}x${String(image.height)} pixels, not ${String(width)}x${String(height)}`,
      );
    }
    return image.data;
  };
  const common = {
    width,
    height,
    displayWidth: Math.round(size.width),
    displayHeight: Math.round(size.height),
  };

  if (animation === undefined || plan.length === 1) {
    const still = format === "apng" ? "png" : format;
    const bytes = encodeStill(still, draw(first), width, height, codecs, budget, settings.quality);
    return {
      bytes,
      format: still,
      mimeType: mimeTypes[still],
      ...common,
      frames: 1,
      duration: 0,
      frameRate: 0,
      frameRateFitted: false,
    };
  }

  const encoder = frameEncoder(format, width, height, animation, codecs, budget, settings.quality);
  let pending: { pixels: Uint8Array; time: number; delay: number } | undefined;
  const projection = new RateProjection(animation.duration, frameRate, limits.maxOutputBytes);
  const write = (frame: { pixels: Uint8Array; time: number; delay: number }): void => {
    const covered = Math.min(animation.duration, frame.time + frame.delay * unit.ms);
    try {
      encoder.add(frame.pixels, frame.delay);
    } catch (error) {
      throw projection.explain(error, budget.bytes, covered);
    }
    projection.written(budget.bytes, covered);
  };
  for (const [index, frame] of plan.entries()) {
    const pixels = draw(index === 0 ? first : input.frame(frame.time));
    if (pending !== undefined && samePixels(pending.pixels, pixels)) {
      pending.delay += frame.delay;
      continue;
    }
    if (pending !== undefined) write(pending);
    pending = { pixels, time: frame.time, delay: frame.delay };
  }
  if (pending !== undefined) write(pending);
  let bytes: Uint8Array;
  try {
    bytes = encoder.finish();
  } catch (error) {
    throw projection.explain(error, budget.bytes, animation.duration);
  }
  return {
    bytes,
    format,
    mimeType: mimeTypes[format],
    ...common,
    frames: encoder.frames,
    duration: animation.duration,
    frameRate,
    frameRateFitted,
  };
}

function resolveSettings(options: RasterOptions): Settings {
  const { format } = options;
  if (!rasterFormats.includes(format)) {
    throw new RasterError("raster-options", `format must be one of ${rasterFormats.join(", ")}`);
  }
  const scale = options.scale ?? defaultScale;
  if (!(Number.isFinite(scale) && scale >= 1 && scale <= 4)) {
    throw new RasterError("raster-options", `scale must be in 1..4, got ${String(scale)}`);
  }
  const maxFrameRate = format === "gif" ? maxGifFrameRate : 60;
  const { frameRate } = options;
  if (
    frameRate !== undefined &&
    !(Number.isInteger(frameRate) && frameRate >= 1 && frameRate <= maxFrameRate)
  ) {
    throw new RasterError(
      "raster-options",
      `frame rate must be a whole number in 1..${String(maxFrameRate)} for ${labels[format]}, got ${String(frameRate)}`,
    );
  }
  const time = options.time;
  if (time !== undefined && !(Number.isFinite(time) && time >= 0 && time <= maxTime)) {
    throw new RasterError(
      "raster-options",
      `time must be in 0..${String(maxTime)} ms, got ${String(time)}`,
    );
  }
  const { quality } = options;
  if (quality !== undefined) {
    if (format !== "webp") {
      throw new RasterError("raster-options", `quality applies to webp only, got format ${format}`);
    }
    if (!(Number.isInteger(quality) && quality >= 1 && quality <= 100)) {
      throw new RasterError(
        "raster-options",
        `quality must be a whole number in 1..100, got ${String(quality)}`,
      );
    }
  }
  return {
    format,
    scale,
    frameRate,
    time,
    quality,
    limits: { ...RasterLimits, ...options.limits },
  };
}

function checkSide(settings: Settings, width: number, height: number): void {
  const { limits } = settings;
  if (width > limits.maxSide || height > limits.maxSide) {
    throw new RasterError(
      "raster-too-large",
      `the image would be ${String(width)}x${String(height)} pixels at scale ${String(settings.scale)}; each side may be at most ${String(limits.maxSide)}, so lower the scale (for example to 1)`,
    );
  }
}

/** " to 16 or less" for the highest rate that fits. */
function upTo(rate: number | undefined): string {
  return rate === undefined ? "" : ` to ${String(rate)} or less`;
}

function checkPlan(
  settings: Settings,
  width: number,
  height: number,
  frames: number,
  frameRate: number,
  lowerRate: () => number | undefined,
): void {
  const { limits } = settings;
  if (frames > limits.maxFrames) {
    throw new RasterError(
      "raster-too-many-frames",
      `the animation would have ${String(frames)} frames at ${String(frameRate)} fps, more than the ${String(limits.maxFrames)} allowed; lower the frame rate${upTo(lowerRate())}`,
    );
  }
  const pixels = width * height * frames;
  if (pixels > limits.maxTotalPixels) {
    const rate = lowerRate();
    const fix =
      rate === undefined
        ? "lower the scale or the frame rate"
        : `lower the frame rate${upTo(rate)}, or the scale`;
    throw new RasterError(
      "raster-too-many-pixels",
      `the export would draw ${String(pixels)} pixels (${String(frames)} frames of ${String(width)}x${String(height)}), more than the ${String(limits.maxTotalPixels)} allowed; ${fix}`,
    );
  }
}

function checkImageWork(
  limits: RasterLimits,
  work: { pixels: number; images: number; draws: number },
  frames: number,
  lowerRate: () => number | undefined,
): void {
  if (work.pixels <= limits.maxImagePixels) return;
  throw new RasterError(
    "raster-too-many-image-pixels",
    `drawing the images would decode ${String(work.pixels)} pixels (${String(work.images)} images drawn ${String(work.draws)} times a frame, ${String(frames)} frames), more than the ${String(limits.maxImagePixels)} allowed; draw large images fewer times or smaller, or lower the frame rate${upTo(lowerRate())}`,
  );
}

function required(codec: WebpCodec | undefined): WebpCodec {
  if (codec === undefined) throw new Error("WebP output needs the WebP codec");
  return codec;
}

function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  const width = Number(/\swidth="([0-9.]+)"/.exec(root)?.[1]);
  const height = Number(/\sheight="([0-9.]+)"/.exec(root)?.[1]);
  if (!(width > 0 && height > 0)) {
    throw new RasterError("raster-image", "the SVG has no width and height on its root element");
  }
  return { width, height };
}

function encodeStill(
  format: RasterFormat,
  pixels: Uint8Array,
  width: number,
  height: number,
  codecs: WebpCodec | undefined,
  budget: OutputBudget,
  quality: number | undefined,
): Uint8Array {
  if (format === "webp") {
    return encodeWebpStill(pixels, width, height, required(codecs), budget, quality);
  }
  if (format === "gif") {
    const encoder = encodeGif(width, height, undefined, budget);
    encoder.add(pixels, 0);
    return encoder.finish();
  }
  return encodePng(pixels, width, height, budget);
}

function frameEncoder(
  format: RasterFormat,
  width: number,
  height: number,
  animation: Timeline,
  codecs: WebpCodec | undefined,
  budget: OutputBudget,
  quality: number | undefined,
): FrameEncoder {
  if (format === "webp") {
    return encodeWebp(width, height, animation.loop, required(codecs), budget, quality);
  }
  if (format === "gif") return encodeGif(width, height, animation, budget);
  return encodeApng(width, height, animation.loop, budget);
}
