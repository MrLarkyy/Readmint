import { formatNumber } from "./formatNumber.js";
import { opacityAttribute, rotation, transformAttribute } from "./nodeAttributes.js";
import type { RenderContext } from "./RenderContext.js";
import type { GroupNode } from "./RenderNode.js";
import { renderLayer } from "./renderLayer.js";

/**
 * A `<g>` translated to the group's position, so children use the group's coordinates; a clip is a rectangle of
 * the group box in those coordinates (the clip path follows the group's transform).
 */
export function renderGroup(context: RenderContext, node: GroupNode): void {
  const writer = context.writer;
  const translate =
    node.x === 0 && node.y === 0
      ? ""
      : `translate(${formatNumber(node.x)} ${formatNumber(node.y)})`;
  let clip = "";
  if (node.clip) {
    const id = writer.id("c");
    writer.define(
      `<clipPath id="${id}"><rect width="${formatNumber(node.width)}" height="${formatNumber(node.height)}"/></clipPath>`,
    );
    clip = ` clip-path="url(#${id})"`;
  }
  writer.write(
    `<g${transformAttribute(translate, rotation(node, 0, 0))}${opacityAttribute(node)}${clip}>`,
  );
  for (const child of node.children) renderLayer(context, child);
  writer.write("</g>");
}
