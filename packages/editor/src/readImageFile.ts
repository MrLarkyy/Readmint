import { EntropyBudget, RenderLimits, sniffImage, type ImageInfo } from "@readmint/renderer";
import { EditorLimits } from "./EditorLimits.js";

export type ImageFileResult =
  | { readonly ok: true; readonly info: ImageInfo }
  | { readonly ok: false; readonly message: string };

/**
 * Checks an image file the user gave as the renderer checks one image asset, in the same order: its size before
 * anything is read from it (`maxImageBytes`), the format sniffed from its bytes (PNG, JPEG, GIF or WebP, never SVG;
 * a JPEG's image data walked to its Huffman symbols within the renderer's step bounds), then each side
 * (`maxImageSide`) and the animation frames (`maxAnimationFrames`). The file is checked alone: the bound a render puts
 * on the JPEG data of all its images together is the preview's to report. Never throws for a hostile file.
 */
export function readImageFile(bytes: Uint8Array): ImageFileResult {
  if (bytes.length > EditorLimits.maxImageBytes) {
    return {
      ok: false,
      message: `is ${String(bytes.length)} bytes, more than the ${String(EditorLimits.maxImageBytes)} an image may have`,
    };
  }
  const budget = new EntropyBudget();
  const sniffed = sniffImage(bytes, RenderLimits.maxAnimationFrames, budget);
  if (!sniffed.ok) {
    const reason = budget.exhausted ? EntropyBudget.message() : sniffed.message;
    return { ok: false, message: `cannot be used: ${reason}` };
  }
  const { info } = sniffed;
  if (info.width > RenderLimits.maxImageSide || info.height > RenderLimits.maxImageSide) {
    return {
      ok: false,
      message: `is ${String(info.width)}x${String(info.height)} pixels; each side may be at most ${String(RenderLimits.maxImageSide)}`,
    };
  }
  if (info.frames > RenderLimits.maxAnimationFrames) {
    return {
      ok: false,
      message: `has more than ${String(RenderLimits.maxAnimationFrames)} animation frames`,
    };
  }
  return { ok: true, info };
}
