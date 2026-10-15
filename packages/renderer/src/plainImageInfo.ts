import type { ImageInfo } from "./sniffImage.js";

/**
 * What `sniffImage` finds in the copy `loadImage` writes of a JPEG sniffed as `info` (`uprightImage`, then
 * `plainColourImage`), without walking the copy: every Orientation entry says 1, and moved forward by the colour
 * ranges removed before it, and no colour data is left. Each removed range runs from the first fill byte before its
 * marker to the segment's end, so the walk of the copy meets the same markers; the symbol check takes the same steps,
 * as no scan changes. Undefined for other formats.
 */
export function plainImageInfo(info: ImageInfo): ImageInfo | undefined {
  if (info.mime !== "image/jpeg") return undefined;
  const removedBefore = (offset: number): number =>
    info.colourData
      .filter((range) => range.start < offset)
      .reduce((sum, range) => sum + range.end - range.start, 0);
  return {
    ...info,
    orientation: 1,
    orientationFields: info.orientationFields.map((field) => ({
      ...field,
      orientation: 1,
      entries: field.entries.map((entry) => entry - removedBefore(entry)),
    })),
    colourData: [],
  };
}
