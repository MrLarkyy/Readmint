import type { SfntFont } from "@readmint/fonts";
import type { Bounds } from "./pathBounds.js";
import { placeBounds, placeThrough, transformSteps } from "./PlacementStep.js";
import type { GroupNode, RenderNode, TextNode } from "./RenderNode.js";
import { sampleTransforms, timelinePosition } from "./sampleAnimation.js";
import { strokeBounds } from "./strokeBounds.js";

/**
 * A box surely containing everything `node` draws, in the coordinates it is drawn in: its own rotation and, in a
 * frame (`time` set), the groups its transform tracks wrap around it. Strokes reach their miter tips, glyphs the
 * head box of their font, turns are bounded by cosine and sine intervals, and the arithmetic is + - * / % round min
 * max abs and a correctly rounded square root only, so every engine decides alike. Undefined when it cannot be known:
 * an animated node of the animated SVG (CSS moves it), or a group around one.
 */
export function inkBounds(
  node: RenderNode,
  time: number | undefined,
  memo: WeakMap<RenderNode, Bounds | undefined>,
): Bounds | undefined {
  if (memo.has(node)) return memo.get(node);
  const bounds = measure(node, time, memo);
  memo.set(node, bounds);
  return bounds;
}

function measure(
  node: RenderNode,
  time: number | undefined,
  memo: WeakMap<RenderNode, Bounds | undefined>,
): Bounds | undefined {
  const animation = node.animation;
  if (animation === undefined) return turned(node, 0, 0, time, memo);
  if (time === undefined) return undefined;
  const sampled = sampleTransforms(node, animation, timelinePosition(animation, time));
  // As renderAnimated draws it: moved by the centre the transform groups sit in.
  const own = turned(node, -(sampled.centre?.x ?? 0), -(sampled.centre?.y ?? 0), time, memo);
  return placeThrough(own, transformSteps(sampled));
}

/** The node drawn moved by `dx`, `dy`, with its rotation about the centre of its (moved) box. */
function turned(
  node: RenderNode,
  dx: number,
  dy: number,
  time: number | undefined,
  memo: WeakMap<RenderNode, Bounds | undefined>,
): Bounds | undefined {
  const x = node.x + dx;
  const y = node.y + dy;
  const bounds = unturned(node, x, y, time, memo);
  if (bounds === undefined || node.rotation === undefined || node.rotation === 0) return bounds;
  return placeBounds(bounds, {
    kind: "turn",
    degrees: node.rotation,
    cx: x + node.width / 2,
    cy: y + node.height / 2,
  });
}

function unturned(
  node: RenderNode,
  x: number,
  y: number,
  time: number | undefined,
  memo: WeakMap<RenderNode, Bounds | undefined>,
): Bounds | undefined {
  switch (node.kind) {
    case "rect":
    case "ellipse":
      return grown(box(x, y, node.width, node.height), (node.strokeWidth ?? 1) / 2 + 1);
    case "path": {
      const strokeWidth = node.strokeWidth ?? 1;
      const stroke = strokeBounds(node.d, strokeWidth);
      // No point in the data: the layout box with the longest miter (`stroke-miterlimit` 4 half widths) around it.
      if (stroke === undefined)
        return grown(box(x, y, node.width, node.height), 2 * strokeWidth + 1);
      return {
        minX: stroke.minX + x - 1,
        minY: stroke.minY + y - 1,
        maxX: stroke.maxX + x + 1,
        maxY: stroke.maxY + y + 1,
      };
    }
    case "text":
      return textBounds(node, x, y);
    case "image":
      return grown(box(x, y, node.width, node.height), 1);
    case "group":
      return groupBounds(node, x, y, time, memo);
  }
}

/**
 * The glyphs, not the layout box: right-aligned text in a box wider than the canvas is bounded by where it draws. A
 * glyph lies within the head box of the font its run draws with (fallback runs carry their own), grown by 1 for
 * rounding; a font whose head box is degenerate gets 1 em left of the pen to 2 em right, 2 em above the baseline to
 * 1 em below.
 */
function textBounds(node: TextNode, x: number, y: number): Bounds {
  const size = node.fontSize;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  node.lines.forEach((line, index) => {
    const baseline = y + node.baseline + index * node.lineAdvance;
    for (const run of line.runs) {
      const reach = glyphReach(run.font.font, size);
      for (const glyph of run.glyphs) {
        const gx = x + glyph.x;
        const gy = baseline - glyph.y;
        bounds.minX = Math.min(bounds.minX, gx + reach.left);
        bounds.maxX = Math.max(bounds.maxX, gx + reach.right);
        bounds.minY = Math.min(bounds.minY, gy + reach.top);
        bounds.maxY = Math.max(bounds.maxY, gy + reach.bottom);
      }
    }
  });
  return bounds.minX === Infinity ? box(x, y, node.width, node.height) : bounds;
}

/** How far a glyph of `font` at `size` reaches from its pen position on the baseline (y down). */
function glyphReach(
  font: SfntFont,
  size: number,
): { left: number; right: number; top: number; bottom: number } {
  const { xMin, yMin, xMax, yMax } = font.boundingBox;
  if (!(xMin < xMax && yMin < yMax))
    return { left: -size, right: 2 * size, top: -2 * size, bottom: size };
  const scale = size / font.unitsPerEm;
  return {
    left: scale * xMin - 1,
    right: scale * xMax + 1,
    top: -scale * yMax - 1,
    bottom: -scale * yMin + 1,
  };
}

/**
 * The union of the children in the group's coordinates, cut to the group box when it clips, then moved to the
 * group's position. A clip whose children all lie outside it gives an inverted box (min above max) that still lies
 * where the clip and the children are, so a far child of a clip group on the canvas counts as off the canvas.
 */
function groupBounds(
  node: GroupNode,
  x: number,
  y: number,
  time: number | undefined,
  memo: WeakMap<RenderNode, Bounds | undefined>,
): Bounds | undefined {
  if (node.children.length === 0) return box(x, y, node.width, node.height);
  let union = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const child of node.children) {
    const bounds = inkBounds(child, time, memo);
    if (bounds === undefined) return undefined;
    union = {
      minX: Math.min(union.minX, bounds.minX),
      minY: Math.min(union.minY, bounds.minY),
      maxX: Math.max(union.maxX, bounds.maxX),
      maxY: Math.max(union.maxY, bounds.maxY),
    };
  }
  const local = node.clip
    ? {
        minX: Math.max(union.minX, 0),
        minY: Math.max(union.minY, 0),
        maxX: Math.min(union.maxX, node.width),
        maxY: Math.min(union.maxY, node.height),
      }
    : union;
  return placeBounds(local, { kind: "translate", x, y });
}

function box(x: number, y: number, width: number, height: number): Bounds {
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}

function grown(bounds: Bounds, by: number): Bounds {
  return {
    minX: bounds.minX - by,
    minY: bounds.minY - by,
    maxX: bounds.maxX + by,
    maxY: bounds.maxY + by,
  };
}
