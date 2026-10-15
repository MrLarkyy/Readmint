import { MalformedFont } from "@readmint/fonts";
import type { LoadedFont } from "./loadFont.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { echo } from "./resolveValue.js";

/**
 * Runs `work` on a loaded font. Outlines, kerning and subsets are read on first use, so a crafted font can still
 * turn out broken here: that is the asset's `asset-format` issue, never an internal error.
 */
export function withFont<T>(context: RenderContext, font: LoadedFont, work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof MalformedFont) {
      context.fail(
        pointer(pointer("/assets/fonts", font.asset), "src"),
        "asset-format",
        `font asset ${echo(font.asset)}: ${error.message}`,
      );
    }
    throw error;
  }
}
