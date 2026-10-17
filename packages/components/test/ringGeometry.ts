import {
  apply,
  attributeOf,
  placedElements,
  turnOf,
  type Matrix,
} from "../../renderer/test/svgTransforms.js";

/** A point of a rotating ring in a frame SVG: where it sits on the canvas and how far the chain above it has turned it. */
export interface RingPoint {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  /** Turn of the composed transform in degrees, in (-180, 180]. */
  readonly degrees: number;
}

function point(label: string, m: Matrix, x: number, y: number): RingPoint {
  return { label, ...apply(m, x, y), degrees: turnOf(m) };
}

/** The `labels` words (text of a tspan) with the middle of their baseline run on the canvas, in the order of `labels`. */
export function ringLabelGeometry(svg: string, labels: readonly string[]): readonly RingPoint[] {
  const found: RingPoint[] = [];
  for (const element of placedElements(svg)) {
    if (element.name !== "tspan" || !labels.includes(element.text)) continue;
    const xs = (attributeOf(element.attributes, "x") ?? "").split(" ").map(Number);
    const y = Number(attributeOf(element.attributes, "y"));
    found.push(
      point(element.text, element.matrix, ((xs[0] ?? 0) + (xs[xs.length - 1] ?? 0)) / 2, y),
    );
  }
  return found.sort((x, y) => labels.indexOf(x.label) - labels.indexOf(y.label));
}

/**
 * The dots and spokes a ring draws from the origin of their orbit (a filled ellipse centred there, a path starting
 * there), in document order, labelled by their index. A stroked ring around a point (a ping) is no dot.
 */
export function ringDotGeometry(svg: string): readonly RingPoint[] {
  const found: RingPoint[] = [];
  for (const element of placedElements(svg)) {
    const dot =
      element.name === "ellipse"
        ? attributeOf(element.attributes, "cx") === "0" &&
          attributeOf(element.attributes, "cy") === "0" &&
          attributeOf(element.attributes, "fill") !== "none"
        : element.name === "path" &&
          /^M0 0(?![\d.])/.test(attributeOf(element.attributes, "d") ?? "");
    if (dot) found.push(point(String(found.length), element.matrix, 0, 0));
  }
  return found;
}
