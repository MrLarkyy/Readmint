import { escapeAttribute } from "./escapeXml.js";
import type { Orientation } from "./exifOrientation.js";
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
 * Per EXIF orientation 2-8: the linear part of the matrix that maps the stored pixels' box onto the layer's box, and
 * whether its translation adds the layer's width and height. 5-8 swap the axes.
 */
const orientations: Readonly<
  Record<Exclude<Orientation, 1>, readonly [linear: string, addWidth: boolean, addHeight: boolean]>
> = {
  2: ["-1 0 0 1", true, false],
  3: ["-1 0 0 -1", true, true],
  4: ["1 0 0 -1", false, true],
  5: ["0 1 1 0", false, false],
  6: ["0 1 -1 0", true, false],
  7: ["0 -1 -1 0", true, true],
  8: ["0 -1 1 0", false, true],
};

/**
 * The image inlined as a data URI of its sniffed type; `alt` becomes the accessible name. Data drawn more than once
 * (a repeat, or assets with the same bytes) is written once: an `<image>` in `<defs>` at its own size, a `<symbol>`
 * per fit whose viewBox and preserveAspectRatio do what the inline image does, and a `<use>` per node, sized like the
 * inline image so the same transform applies. Images with EXIF data stay inline. An EXIF orientation other than 1
 * (its entries already set to 1 in the data URI) is a `matrix()` on the `<image>`: the image is laid out at the
 * origin in the layer's box, width and height swapped for 5-8, and the matrix turns that box onto the layer's, after
 * which the layer's rotation applies as for any image.
 */
export function renderImage(context: RenderContext, node: ImageNode, extra = ""): void {
  const { asset, dataUri, dataKey, exif } = node.image;
  const shared = !exif && (context.imageUses.get(dataKey) ?? 0) > 1;
  const written = shared && context.sharedImages.has(dataKey) ? 0 : dataUri.length;
  context.imageBytes.set(asset, (context.imageBytes.get(asset) ?? 0) + written);
  const label = node.alt === undefined ? "" : ` aria-label="${escapeAttribute(node.alt)}"`;
  const turn = rotation(node, node.x, node.y);
  if (node.image.orientation !== 1) {
    const [linear, addWidth, addHeight] = orientations[node.image.orientation];
    const swapped = node.image.orientation >= 5;
    const box = boxAttributes(
      0,
      0,
      swapped ? node.height : node.width,
      swapped ? node.width : node.height,
    );
    const e = formatNumber(node.x + (addWidth ? node.width : 0));
    const f = formatNumber(node.y + (addHeight ? node.height : 0));
    const transform = transformAttribute(turn, `matrix(${linear} ${e} ${f})`);
    context.writer.write(
      `<image ${box} preserveAspectRatio="${aspect[node.fit]}" href="${dataUri}"${label}${opacityAttribute(node)}${transform}${extra}/>`,
    );
    return;
  }
  const box = boxAttributes(node.x, node.y, node.width, node.height);
  const rest = `${opacityAttribute(node)}${transformAttribute(turn)}${extra}`;
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

function boxAttributes(x: number, y: number, width: number, height: number): string {
  return `x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(width)}" height="${formatNumber(height)}"`;
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
