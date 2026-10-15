import type { LayerBox, LayerTurn } from "./LayerBox.js";
import type { RenderNode } from "./RenderNode.js";

/**
 * The box of every node in paint order, after layout. A node turns about the centre of its box, and a group's
 * children are drawn in its turned coordinates (as `renderGroup` and the shape writers draw them). Moving a turn's
 * centre along with the offsets keeps every box and centre in one unturned frame: on the canvas a node is its box
 * turned by its own rotation, then by each group's turn, innermost first.
 */
export function collectLayerBoxes(nodes: readonly RenderNode[]): LayerBox[] {
  const boxes: LayerBox[] = [];
  visit(nodes, 0, 0, [], undefined, boxes);
  return boxes;
}

function visit(
  nodes: readonly RenderNode[],
  offsetX: number,
  offsetY: number,
  groupTurns: readonly LayerTurn[],
  owner: string | undefined,
  boxes: LayerBox[],
): void {
  for (const node of nodes) {
    // Layers of a component definition carry `/components/...` paths: they belong to the instance that drew them.
    const layer = node.path.startsWith("/layers/") || owner === undefined ? node.path : owner;
    const x = offsetX + node.x;
    const y = offsetY + node.y;
    const rotation = node.rotation === undefined ? 0 : round(node.rotation);
    boxes.push({
      layer,
      x: round(x),
      y: round(y),
      width: round(node.width),
      height: round(node.height),
      ...(rotation === 0 ? {} : { rotation }),
      ...(groupTurns.length === 0 ? {} : { groupTurns }),
    });
    if (node.kind !== "group") continue;
    const turns =
      rotation === 0
        ? groupTurns
        : [
            {
              degrees: rotation,
              cx: round(x + node.width / 2),
              cy: round(y + node.height / 2),
            },
            ...groupTurns,
          ];
    visit(node.children, x, y, turns, layer, boxes);
  }
}

/** Rounded to 3 decimals, `-0` as `0`, as `formatNumber` rounds what the SVG prints. */
function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}
