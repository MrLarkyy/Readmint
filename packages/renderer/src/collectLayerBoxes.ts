import type { LayerBox, LayerTurn } from "./LayerBox.js";
import type { NodeOrbit } from "./NodeOrbit.js";
import type { RenderNode } from "./RenderNode.js";

/**
 * The box of every node in paint order, after layout. A node turns about the centre of its box, and a group's
 * children are drawn in its turned coordinates (as `renderGroup` and the shape writers draw them). Moving a turn's
 * centre along with the offsets keeps every box and centre in one unturned frame: on the canvas a node is its box
 * turned by its own rotation, then by each group's turn, innermost first. An orbit adds its moves to the offset and
 * its turns (at the start of the timeline) as group turns, about where the chain has moved to.
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
    const frame =
      node.orbit === undefined
        ? { x: offsetX, y: offsetY, turns: groupTurns }
        : orbitFrame(node.orbit, offsetX, offsetY, groupTurns);
    const x = frame.x + node.x;
    const y = frame.y + node.y;
    const rotation = node.rotation === undefined ? 0 : round(node.rotation);
    boxes.push({
      layer,
      x: round(x),
      y: round(y),
      width: round(node.width),
      height: round(node.height),
      ...(rotation === 0 ? {} : { rotation }),
      ...(frame.turns.length === 0 ? {} : { groupTurns: frame.turns }),
    });
    if (node.kind !== "group") continue;
    const turns =
      rotation === 0
        ? frame.turns
        : [
            {
              degrees: rotation,
              cx: round(x + node.width / 2),
              cy: round(y + node.height / 2),
            },
            ...frame.turns,
          ];
    visit(node.children, x, y, turns, layer, boxes);
  }
}

/** Where an orbit's chain moves the origin, unturned, and its turns innermost first before the outer ones. */
function orbitFrame(
  orbit: NodeOrbit,
  offsetX: number,
  offsetY: number,
  outer: readonly LayerTurn[],
): { x: number; y: number; turns: readonly LayerTurn[] } {
  let [x, y] = [offsetX, offsetY];
  const turns: LayerTurn[] = [];
  for (const part of orbit.parts) {
    if (part.kind === "move") {
      x += part.x;
      y += part.y;
    } else if (round(part.degrees) !== 0) {
      turns.unshift({ degrees: round(part.degrees), cx: round(x), cy: round(y) });
    }
  }
  return { x, y, turns: [...turns, ...outer] };
}

/** Rounded to 3 decimals, `-0` as `0`, as `formatNumber` rounds what the SVG prints. */
function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}
