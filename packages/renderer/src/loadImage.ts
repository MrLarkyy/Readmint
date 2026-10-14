import { encodeBase64 } from "./base64.js";
import { decodeDataUri } from "./decodeDataUri.js";
import { ownEntry } from "./ownEntry.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { echo } from "./resolveValue.js";
import { sniffImage, type ImageInfo } from "./sniffImage.js";

/** An image asset that passed every check, with its bytes re-encoded as a data URI of the sniffed type. */
export interface LoadedImage extends ImageInfo {
  readonly asset: string;
  readonly dataUri: string;
}

/** Checks one image asset (size before decoding, magic bytes, dimensions, frames) once per render. */
export function loadImage(context: RenderContext, assetId: string, usePath: string): LoadedImage {
  const cached = context.images.get(assetId);
  if (cached !== undefined) return cached;
  const asset = ownEntry(context.design.assets?.images, assetId);
  if (asset === undefined)
    context.fail(usePath, "missing-asset", `no image asset ${echo(assetId)}`);
  const assetPath = pointer("/assets/images", assetId);
  const srcPath = pointer(assetPath, "src");
  const name = echo(assetId);
  const limits = context.limits;
  let bytes: Uint8Array;
  let mime: string | undefined;
  const supplied = ownEntry(context.assets.images, assetId);
  if (supplied instanceof Uint8Array) {
    if (supplied.length > limits.maxImageBytes) {
      context.fail(
        assetPath,
        "asset-too-large",
        `image asset ${name} holds ${String(supplied.length)} bytes, more than the ${String(limits.maxImageBytes)} allowed`,
      );
    }
    bytes = supplied;
  } else if (asset.src.startsWith("data:")) {
    const decoded = decodeDataUri(asset.src, limits.maxImageBytes);
    if (!decoded.ok) {
      context.fail(
        srcPath,
        decoded.problem === "too-large" ? "asset-too-large" : "asset-format",
        `image asset ${name}: ${decoded.message}`,
      );
    }
    bytes = decoded.bytes;
    mime = decoded.mime;
  } else {
    context.fail(
      srcPath,
      "missing-asset",
      `image asset ${name}: no bytes were supplied for ${echo(asset.src)}`,
    );
  }
  const sniffed = sniffImage(bytes, limits.maxAnimationFrames);
  if (!sniffed.ok) context.fail(srcPath, "asset-format", `image asset ${name}: ${sniffed.message}`);
  const info = sniffed.info;
  if (mime !== undefined && mime !== info.mime) {
    context.fail(
      srcPath,
      "asset-format",
      `image asset ${name} is declared ${mime} but holds ${info.mime}`,
    );
  }
  if (info.width > limits.maxImageSide || info.height > limits.maxImageSide) {
    context.fail(
      assetPath,
      "asset-too-large",
      `image asset ${name} is ${String(info.width)}x${String(info.height)} pixels; each side may be at most ${String(limits.maxImageSide)}`,
    );
  }
  if (info.frames > limits.maxAnimationFrames) {
    context.fail(
      assetPath,
      "asset-too-large",
      `image asset ${name} has more than ${String(limits.maxAnimationFrames)} animation frames`,
    );
  }
  const loaded: LoadedImage = {
    ...info,
    asset: assetId,
    dataUri: `data:${info.mime};base64,${encodeBase64(bytes)}`,
  };
  context.images.set(assetId, loaded);
  return loaded;
}
