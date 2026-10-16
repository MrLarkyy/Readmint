/** A 2D affine transform `[a, b, c, d, e, f]` as SVG's `matrix()` writes it. */
export type Matrix = readonly [number, number, number, number, number, number];

export const identity: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** The matrix of an SVG `transform` list (translate, rotate with or without a centre, scale, matrix); tests only. */
export function transformMatrix(list: string | undefined): Matrix {
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

/** A start tag of an SVG with the transform composed from all its ancestors and its own. */
export interface PlacedElement {
  readonly name: string;
  readonly attributes: string;
  readonly matrix: Matrix;
  /** The text between this tag and the next one. */
  readonly text: string;
}

/** Visits every start tag of `svg` (written without comments or CDATA) with its composed transform. */
export function* placedElements(svg: string): Generator<PlacedElement> {
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

/** The value of attribute `name` in a start tag's attributes. */
export function attributeOf(attributes: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(attributes)?.[1];
}

/** Where `matrix` puts the point (`x`, `y`). */
export function apply(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

/** The turn of `matrix` in degrees, in (-180, 180]. */
export function turnOf(matrix: Matrix): number {
  return (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
}
