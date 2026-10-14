import { escapeAttribute } from "./escapeXml.js";
import { formatNumber } from "./formatNumber.js";
import { opacityAttribute, rotation, transformAttribute } from "./nodeAttributes.js";
import type { RenderContext } from "./RenderContext.js";
import type { ImageNode } from "./RenderNode.js";

const aspect: Readonly<Record<ImageNode["fit"], string>> = {
  contain: "xMidYMid meet",
  cover: "xMidYMid slice",
  fill: "none",
};

/** The image inlined as a data URI of its sniffed type; `alt` becomes the accessible name. */
export function renderImage(context: RenderContext, node: ImageNode, extra = ""): void {
  const { asset, dataUri } = node.image;
  context.imageBytes.set(asset, (context.imageBytes.get(asset) ?? 0) + dataUri.length);
  const label = node.alt === undefined ? "" : ` aria-label="${escapeAttribute(node.alt)}"`;
  context.writer.write(
    `<image x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" preserveAspectRatio="${aspect[node.fit]}" href="${dataUri}"${label}${opacityAttribute(node)}${transformAttribute(rotation(node, node.x, node.y))}${extra}/>`,
  );
}
