import { escapeAttribute } from "./escapeXml.js";
import { formatNumber } from "./formatNumber.js";
import { opacityAttribute, rotation, transformAttribute } from "./nodeAttributes.js";
import { paintAttributes } from "./paint.js";
import type { EllipseNode, PathNode, RectNode, ShapeStyle } from "./RenderNode.js";
import type { SvgWriter } from "./SvgWriter.js";

export function shapeAttributes(writer: SvgWriter, style: ShapeStyle): string {
  const width =
    style.strokeWidth === undefined ? "" : ` stroke-width="${formatNumber(style.strokeWidth)}"`;
  return `${paintAttributes(writer, "fill", style.fill)}${paintAttributes(writer, "stroke", style.stroke)}${width}`;
}

export function renderRect(writer: SvgWriter, node: RectNode): void {
  const radius = node.radius === undefined ? "" : ` rx="${formatNumber(node.radius)}"`;
  writer.write(
    `<rect x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}"${radius}${shapeAttributes(writer, node)}${opacityAttribute(node)}${transformAttribute(rotation(node, node.x, node.y))}/>`,
  );
}

export function renderEllipse(writer: SvgWriter, node: EllipseNode): void {
  const rx = node.width / 2;
  const ry = node.height / 2;
  writer.write(
    `<ellipse cx="${formatNumber(node.x + rx)}" cy="${formatNumber(node.y + ry)}" rx="${formatNumber(rx)}" ry="${formatNumber(ry)}"${shapeAttributes(writer, node)}${opacityAttribute(node)}${transformAttribute(rotation(node, node.x, node.y))}/>`,
  );
}

/** The path data is emitted as written (the format restricts its characters; it is escaped all the same). */
export function renderPath(writer: SvgWriter, node: PathNode): void {
  const translate =
    node.x === 0 && node.y === 0
      ? ""
      : `translate(${formatNumber(node.x)} ${formatNumber(node.y)})`;
  writer.write(
    `<path d="${escapeAttribute(node.d)}"${shapeAttributes(writer, node)}${opacityAttribute(node)}${transformAttribute(translate, rotation(node, 0, 0))}/>`,
  );
}
