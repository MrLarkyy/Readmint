import type { EntropyFault } from "./JpegEntropy.js";
import { maxDequantized } from "./entropyBlocks.js";
import { EntropyBudget } from "./EntropyBudget.js";
import { maxEntropySteps, maxProgressiveBlocks } from "./JpegEntropy.js";

/** Chromium draws it, resvg (jpeg-decoder 0.3.1) draws nothing or other pixels. */
export const resvgDiffers = (what: string) =>
  `JPEG ${what} is refused, because Chromium and resvg draw it differently`;

/** Neither output draws it: refused to name the reason instead of an empty box. */
export const undrawable = (what: string) =>
  `JPEG ${what} is refused, because neither output draws it`;

/** No encoder writes it and the two decoders keep it apart by their source: refused without a measured difference. */
export const failClosed = (what: string) =>
  `JPEG ${what} is refused, because Chromium and resvg may draw it differently`;

/** The refusal of a file whose entropy-coded data in a scan has `fault`. */
export function entropyRefusal(fault: EntropyFault): string {
  switch (fault) {
    case "code":
      return resvgDiffers("image data with an invalid Huffman code");
    case "dc-category":
      return resvgDiffers("image data with a DC difference of category 12 to 15");
    case "value":
      return failClosed(
        `image data with a coefficient whose dequantized value may pass ${String(maxDequantized)}`,
      );
    case "ac-run":
      return resvgDiffers("image data with a run of coefficients past the end of the block");
    case "eob-run":
      return resvgDiffers("sequential image data with an end-of-band run");
    case "refine-size":
      return resvgDiffers(
        "progressive refinement data with a new coefficient of a size other than 1",
      );
    case "marker":
      return failClosed("image data cut short by a marker");
    case "restart":
      return resvgDiffers("image data without the restart marker in sequence where one is due");
    case "restart-data":
      return failClosed("image data with extra bytes before a restart marker");
    case "block-count":
      return failClosed("non-interleaved scan whose blocks the two decoders count differently");
    case "steps":
      return `JPEG image data that takes more than ${String(maxEntropySteps)} decoding steps is refused`;
    case "budget":
      return EntropyBudget.message();
    case "history":
      return `JPEG progressive frame of more than ${String(maxProgressiveBlocks)} blocks is refused`;
  }
}
