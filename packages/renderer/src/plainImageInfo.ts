import type { ImageInfo } from "./sniffImage.js";

/**
 * What `sniffImage` finds in the copy `loadImage` writes of the JPEG `data` sniffed as `info` (`uprightImage`, then
 * `plainColourImage`), without walking the copy: every Orientation entry says 1, and moved forward by the colour
 * segments removed before it, and no colour data is left. The symbol check of the copy takes the same steps, as no
 * scan changes. Undefined where the walk of the copy may read other markers than the original's: a removed segment
 * not followed by a marker, whose stray bytes past the frame header the copy joins to the bytes before it.
 */
export function plainImageInfo(data: Uint8Array, info: ImageInfo): ImageInfo | undefined {
  if (info.mime !== "image/jpeg") return undefined;
  if (info.colourData.some((range) => data[range.end] !== 0xff)) return undefined;
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
