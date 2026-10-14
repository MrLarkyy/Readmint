import { formatNumber } from "./formatNumber.js";
import type { NodeBase } from "./RenderNode.js";

/** ` opacity="..."` when the node sets an opacity. */
export function opacityAttribute(node: NodeBase): string {
  return node.opacity === undefined ? "" : ` opacity="${formatNumber(node.opacity)}"`;
}

/**
 * `rotate(r cx cy)` around the centre of the node's box (in the coordinates the node is drawn in, with its own
 * position at `originX`/`originY`), or empty without a rotation. The drawer does the trigonometry.
 */
export function rotation(node: NodeBase, originX: number, originY: number): string {
  if (node.rotation === undefined || node.rotation === 0) return "";
  const cx = originX + node.width / 2;
  const cy = originY + node.height / 2;
  return `rotate(${formatNumber(node.rotation)} ${formatNumber(cx)} ${formatNumber(cy)})`;
}

/** ` transform="..."` from the given parts, or empty when none applies. */
export function transformAttribute(...parts: readonly string[]): string {
  const used = parts.filter((part) => part !== "");
  return used.length === 0 ? "" : ` transform="${used.join(" ")}"`;
}
