import type { LayerBox } from "./LayerBox.js";
import type { RenderNode } from "./RenderNode.js";

/** A rotation and a translation: a point (x, y) goes to (a x - b y + e, b x + a y + f). */
interface Placement {
  readonly a: number;
  readonly b: number;
  readonly e: number;
  readonly f: number;
  readonly degrees: number;
}

const identity: Placement = { a: 1, b: 0, e: 0, f: 0, degrees: 0 };

/**
 * The canvas box of every node in paint order, after layout. Each node turns about the centre of its own box in its
 * parent's coordinates, and a group's children are drawn in the group's turned coordinates (as `renderGroup` and the
 * shape writers do); turns and moves compose into one turn and move, so every box stays a rectangle with a rotation.
 */
export function collectLayerBoxes(nodes: readonly RenderNode[]): LayerBox[] {
  const boxes: LayerBox[] = [];
  visit(nodes, identity, undefined, boxes);
  return boxes;
}

function visit(
  nodes: readonly RenderNode[],
  parent: Placement,
  owner: string | undefined,
  boxes: LayerBox[],
): void {
  for (const node of nodes) {
    // Layers of a component definition carry `/components/...` paths: they belong to the instance that drew them.
    const layer = node.path.startsWith("/layers/") || owner === undefined ? node.path : owner;
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const centreX = parent.a * cx - parent.b * cy + parent.e;
    const centreY = parent.b * cx + parent.a * cy + parent.f;
    const degrees = parent.degrees + (node.rotation ?? 0);
    const turned = normalise(degrees);
    boxes.push({
      layer,
      x: round(centreX - node.width / 2),
      y: round(centreY - node.height / 2),
      width: round(node.width),
      height: round(node.height),
      ...(turned === 0 ? {} : { rotation: turned }),
    });
    if (node.kind === "group") visit(node.children, groupPlacement(parent, node), layer, boxes);
  }
}

/** The parent's placement followed by the group's: a move to its position, then its turn about its centre. */
function groupPlacement(parent: Placement, node: RenderNode): Placement {
  const degrees = parent.degrees + (node.rotation ?? 0);
  const radians = (normalise(degrees) * Math.PI) / 180;
  const a = round(Math.cos(radians), 12);
  const b = round(Math.sin(radians), 12);
  // The group's local origin lands where its box corner goes once the box is turned about its centre.
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const cx = node.x + halfW;
  const cy = node.y + halfH;
  const centreX = parent.a * cx - parent.b * cy + parent.e;
  const centreY = parent.b * cx + parent.a * cy + parent.f;
  return {
    a,
    b,
    e: centreX - (a * halfW - b * halfH),
    f: centreY - (b * halfW + a * halfH),
    degrees,
  };
}

/** Degrees in [0, 360), rounded to 3 decimals. */
function normalise(degrees: number): number {
  const turned = round(((degrees % 360) + 360) % 360);
  return turned === 360 ? 0 : turned;
}

function round(value: number, places = 3): number {
  const scale = 10 ** places;
  const rounded = Math.round(value * scale) / scale;
  return rounded === 0 ? 0 : rounded;
}
