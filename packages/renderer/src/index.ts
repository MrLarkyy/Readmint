export const packageName = "@readmint/renderer";

export type { LayerBox, LayerTurn } from "./LayerBox.js";
export type { RenderIssue, RenderIssueCode } from "./RenderIssue.js";
export type { RenderAssets, RenderOptions } from "./RenderOptions.js";
export type { RenderAssetUsage, RenderReport } from "./RenderReport.js";
export type { RenderFontUsage } from "./RenderFontUsage.js";
export type { RenderResult } from "./RenderResult.js";
export { crc32 } from "./crc32.js";
export type { Orientation, OrientationField } from "./exifOrientation.js";
export { frameTimes } from "./frameTimes.js";
export { RenderLimits } from "./RenderLimits.js";
export { EntropyBudget, maxRenderEntropySteps } from "./EntropyBudget.js";
export { renderSvg } from "./renderSvg.js";
export { type ImageInfo, type ImageMime, type SniffResult, sniffImage } from "./sniffImage.js";
