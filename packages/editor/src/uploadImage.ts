import type { Canvas, ImageAsset, ImageLayer } from "@readmint/format";
import { appendLayer } from "./appendLayer.js";
import { assetIdBase } from "./assetIdBase.js";
import { encodeBase64 } from "./base64.js";
import { refuse } from "./commitDesign.js";
import { setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import { layerIds, uniqueId } from "./layerAccess.js";
import { readImageFile } from "./readImageFile.js";

/** An image file the user picked. */
export interface ImageFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * Adds an image file to the design as an image asset whose `src` is a base64 `data:` URI of the type its bytes are
 * (never what the file name says), so the design file carries it, and an image layer showing it at its upright pixel
 * size, scaled down to fit the canvas; the layer goes to the top level or into the group at `parent` and is selected.
 * Asset and layer are one edit. Refused, with the state unchanged: a file over `maxImageBytes` (before it is sniffed),
 * one that is no PNG, JPEG, GIF or WebP or is malformed, one over the renderer's side or frame limits, and one that
 * would make the exported design longer than `DesignLimits.maxSourceLength`.
 */
export function uploadImage(state: EditorState, file: ImageFile, parent?: string): EditorState {
  const name = JSON.stringify(file.name.slice(0, 128));
  const read = readImageFile(file.bytes);
  if (!read.ok) return refuse(state, "image", `image ${name} ${read.message}`);
  const { info } = read;
  const images = state.design.assets?.images ?? {};
  const stem = file.name.replace(/\.[^.]*$/u, "");
  const id = uniqueId(assetIdBase(stem, "image"), new Set(Object.keys(images)), "-");
  const asset: ImageAsset = { src: `data:${info.mime};base64,${encodeBase64(file.bytes)}` };
  const assets = { ...state.design.assets, images: { ...images, [id]: asset } };
  const design = setAt(state.design, "/assets", assets);
  if (design === undefined) return refuse(state, "image", `image ${name} could not be added`);
  // EXIF orientations 5 to 8 turn the stored pixels a quarter: the layer is sized as the image shows.
  const turned = info.orientation >= 5;
  const size = fitted(
    turned ? info.height : info.width,
    turned ? info.width : info.height,
    state.design.canvas,
  );
  const layer: ImageLayer = {
    type: "image",
    id: uniqueId(id, layerIds(state.design), "-"),
    asset: id,
    x: 0,
    y: 0,
    ...size,
  };
  return appendLayer(state, design, layer, parent, "image");
}

/** The size scaled down, never up, to fit a canvas of literal size; whole pixels, at least 1. */
function fitted(
  width: number,
  height: number,
  canvas: Canvas,
): { readonly width: number; readonly height: number } {
  let scale = 1;
  if (typeof canvas.width === "number" && canvas.width > 0)
    scale = Math.min(scale, canvas.width / width);
  if (typeof canvas.height === "number" && canvas.height > 0) {
    scale = Math.min(scale, canvas.height / height);
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
