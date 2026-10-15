import baseline422Uri from "../../renderer/test/assets/jpeg/baseline-422-restart-rows.jpg?inline";
import progressive420Uri from "../../renderer/test/assets/jpeg/progressive-420-restart3.jpg?inline";
import progressiveUri from "../../renderer/test/assets/jpeg/progressive.jpg?inline";
import gradientUri from "../../renderer/test/assets/gradient.jpg?inline";

/**
 * The most one channel of one pixel may differ between Chromium (libjpeg-turbo) and resvg (jpeg-decoder 0.3.1) drawing
 * the same lossy JPEG: they round the IDCT and the chroma upsampling apart. Pinned by jpegDecoderDifference.browser.test.ts
 * and documented in docs/renderer.md (Images).
 */
export const jpegChannelTolerance = 2;

export interface LossyJpeg {
  readonly name: string;
  readonly uri: string;
  /** The largest per-channel difference over every pixel, measured in Chromium 156.0.8078.4 and resvg-wasm 2.6.2. */
  readonly measuredMax: number;
}

export const lossyJpegs: readonly LossyJpeg[] = [
  { name: "gradient (baseline 4:2:0)", uri: gradientUri, measuredMax: 2 },
  { name: "baseline-422-restart-rows", uri: baseline422Uri, measuredMax: 1 },
  { name: "progressive", uri: progressiveUri, measuredMax: 2 },
  { name: "progressive-420-restart3", uri: progressive420Uri, measuredMax: 1 },
];
