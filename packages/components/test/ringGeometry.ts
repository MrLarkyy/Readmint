/** A point of a rotating ring in a frame SVG: where it sits on the canvas and how far the chain above it has turned it. */
export interface RingPoint {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  /** Turn of the composed transform in degrees, in (-180, 180]. */
  readonly degrees: number;
}

type Matrix = readonly [number, number, number, number, number, number];

const identity: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformMatrix(list: string | undefined): Matrix {
  let result = identity;
  if (list === undefined) return result;
  for (const match of list.matchAll(/(translate|rotate|scale|matrix)\(([^)]*)\)/g)) {
    const v = (match[2] ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const a = v[0] ?? 0;
    let next: Matrix;
    if (match[1] === "translate") next = [1, 0, 0, 1, a, v[1] ?? 0];
    else if (match[1] === "scale") next = [a, 0, 0, v[1] ?? a, 0, 0];
    else if (match[1] === "matrix")
      next = [a, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0, v[4] ?? 0, v[5] ?? 0];
    else {
      const radians = (a * Math.PI) / 180;
      const [cos, sin, cx, cy] = [Math.cos(radians), Math.sin(radians), v[1] ?? 0, v[2] ?? 0];
      next = multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [
        1,
        0,
        0,
        1,
        -cx,
        -cy,
      ]);
    }
    result = multiply(result, next);
  }
  return result;
}

interface Visited {
  readonly name: string;
  readonly attributes: string;
  readonly matrix: Matrix;
  /** The text between this tag and the next one. */
  readonly text: string;
}

/** Visits every start tag of `svg` with the transform composed from all its ancestors (and its own). */
function* elements(svg: string): Generator<Visited> {
  const stack: Matrix[] = [identity];
  for (const match of svg.matchAll(/<(\/?)([a-zA-Z]+)((?:[^>"]|"[^"]*")*?)(\/?)>/g)) {
    const [, close, name = "", attributes = "", selfClosing] = match;
    if (close !== "") {
      stack.pop();
      continue;
    }
    const own = /\stransform="([^"]*)"/.exec(attributes)?.[1];
    const matrix = multiply(stack[stack.length - 1] ?? identity, transformMatrix(own));
    const from = match.index + match[0].length;
    yield { name, attributes, matrix, text: svg.slice(from, svg.indexOf("<", from)) };
    if (selfClosing === "") stack.push(matrix);
  }
}

const attribute = (attributes: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(attributes)?.[1];

const turn = (m: Matrix): number => (Math.atan2(m[1], m[0]) * 180) / Math.PI;

function point(label: string, m: Matrix, x: number, y: number): RingPoint {
  return { label, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5], degrees: turn(m) };
}

/** The `labels` words (text of a tspan) with the middle of their baseline run on the canvas, in the order of `labels`. */
export function ringLabelGeometry(svg: string, labels: readonly string[]): readonly RingPoint[] {
  const found: RingPoint[] = [];
  for (const element of elements(svg)) {
    if (element.name !== "tspan" || !labels.includes(element.text)) continue;
    const xs = (attribute(element.attributes, "x") ?? "").split(" ").map(Number);
    const y = Number(attribute(element.attributes, "y"));
    found.push(
      point(element.text, element.matrix, ((xs[0] ?? 0) + (xs[xs.length - 1] ?? 0)) / 2, y),
    );
  }
  return found.sort((x, y) => labels.indexOf(x.label) - labels.indexOf(y.label));
}

/**
 * The dots and spokes a ring draws from the local point (1, 1) of their 2 x 2 box (an ellipse centred there, a path
 * starting there), in document order, labelled by their index.
 */
export function ringDotGeometry(svg: string): readonly RingPoint[] {
  const found: RingPoint[] = [];
  for (const element of elements(svg)) {
    const dot =
      element.name === "ellipse"
        ? attribute(element.attributes, "cx") === "1" && attribute(element.attributes, "cy") === "1"
        : element.name === "path" && /^M1 1(?!\d)/.test(attribute(element.attributes, "d") ?? "");
    if (dot) found.push(point(String(found.length), element.matrix, 1, 1));
  }
  return found;
}
