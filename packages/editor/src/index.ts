export const packageName = "@readmint/editor";

export { addLayer, type NewLayerType } from "./addLayer.js";
export { attachAsset } from "./attachAsset.js";
export { checkFonts } from "./checkFonts.js";
export type { EditorIssue, EditorIssueSource } from "./EditorIssue.js";
export { EditorLimits } from "./EditorLimits.js";
export { createEditorState, type EditorState } from "./EditorState.js";
export { exportDesign } from "./exportDesign.js";
export type { FontCheck } from "./FontCheck.js";
export { importDesign } from "./importDesign.js";
export { boxAt, layerAt } from "./layerAt.js";
export { layerTree, type LayerTreeItem } from "./layerTree.js";
export { loadFixture } from "./loadFixture.js";
export {
  type EditorHandle,
  mountEditor,
  type MountEditorOptions,
  type SavedDesign,
} from "./mountEditor.js";
export { moveLayer } from "./moveLayer.js";
export { newDesign } from "./newDesign.js";
export {
  PreviewClient,
  type PreviewClientOptions,
  type PreviewOutcome,
  type PreviewWorker,
} from "./PreviewClient.js";
export type { PreviewRequest, PreviewResponse } from "./PreviewMessage.js";
export { removeLayer } from "./removeLayer.js";
export { renderPreview, type PreviewInput } from "./renderPreview.js";
export { reorderLayer } from "./reorderLayer.js";
export { resizeLayer, type LayerResize } from "./resizeLayer.js";
export { selectLayer } from "./selectLayer.js";
export { setFontAsset, type FontAssetChange } from "./setFontAsset.js";
export { setLayerProperty } from "./setLayerProperty.js";
export { type FontFile, uploadFont } from "./uploadFont.js";
