import { escapeAttribute } from "./escapeXml.js";
import { formatNumber } from "./formatNumber.js";
import type { LoadedImage } from "./loadImage.js";
import { opacityAttribute, rotation, transformAttribute } from "./nodeAttributes.js";
import type { RenderContext } from "./RenderContext.js";
import type { ImageNode } from "./RenderNode.js";

const aspect: Readonly<Record<ImageNode["fit"], string>> = {
  contain: "xMidYMid meet",
  cover: "xMidYMid slice",
  fill: "none",
};

/**
 * The image inlined as a data URI of its sniffed type; `alt` becomes the accessible name. Data drawn more than once
 * (a repeat, or assets with the same bytes) is written once: an `<image>` in `<defs>` at its own size, a `<symbol>`
 * per fit whose viewBox and preserveAspectRatio do what the inline image does, and a `<use>` per node, sized like the
 * inline image so the same transform applies. Images with EXIF data stay inline: browsers orient them, which the
 * symbol's viewBox, taken from the stored size, would not follow.
 */
export function renderImage(context: RenderContext, node: ImageNode, extra = ""): void {
  const { asset, dataUri, dataKey, exif } = node.image;
  const shared = !exif && (context.imageUses.get(dataKey) ?? 0) > 1;
  const written = shared && context.sharedImages.has(dataKey) ? 0 : dataUri.length;
  context.imageBytes.set(asset, (context.imageBytes.get(asset) ?? 0) + written);
  const box = `x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}"`;
  const label = node.alt === undefined ? "" : ` aria-label="${escapeAttribute(node.alt)}"`;
  const rest = `${opacityAttribute(node)}${transformAttribute(rotation(node, node.x, node.y))}${extra}`;
  if (!shared) {
    context.writer.write(
      `<image ${box} preserveAspectRatio="${aspect[node.fit]}" href="${dataUri}"${label}${rest}/>`,
    );
    return;
  }
  // A <use> has no implicit role, unlike <image>, so the accessible name needs one.
  const role = label === "" ? "" : ` role="img"${label}`;
  context.writer.write(`<use href="#${symbolId(context, node)}" ${box}${role}${rest}/>`);
}

function symbolId(context: RenderContext, node: ImageNode): string {
  const { width, height } = node.image;
  const image = imageId(context, node.image);
  return context.writer.share(
    "s",
    (id) =>
      `<symbol id="${id}" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" preserveAspectRatio="${aspect[node.fit]}"><use href="#${image}"/></symbol>`,
  );
}

function imageId(context: RenderContext, image: LoadedImage): string {
  const known = context.sharedImages.get(image.dataKey);
  if (known !== undefined) return known;
  const id = context.writer.share(
    "i",
    (imageId) =>
      `<image id="${imageId}" width="${formatNumber(image.width)}" height="${formatNumber(image.height)}" href="${image.dataUri}"/>`,
  );
  context.sharedImages.set(image.dataKey, id);
  return id;
}
