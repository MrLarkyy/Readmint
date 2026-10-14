/**
 * Receives the segments of path data in absolute coordinates, each with the point it starts from. `H`/`V` arrive as
 * lines, `T` as a quadratic and `S` as a cubic with the reflected control point.
 */
export interface PathSegments {
  move(x: number, y: number): void;
  line(fromX: number, fromY: number, x: number, y: number): void;
  quadratic(fromX: number, fromY: number, cx: number, cy: number, x: number, y: number): void;
  cubic(
    fromX: number,
    fromY: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
  ): void;
  /** `rx`/`ry` are the radii as written, made non-negative. */
  arc(fromX: number, fromY: number, rx: number, ry: number, x: number, y: number): void;
  /** Back to the start of the subpath at `x`/`y`. */
  close(fromX: number, fromY: number, x: number, y: number): void;
}

const parameterCounts: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

const numberPattern = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** One pass over `d`; stops at the first thing that is not path data, as SVG renders up to the error. */
export function walkPathData(d: string, segments: PathSegments): void {
  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let controlX = 0;
  let controlY = 0;
  let previous = "";
  const skip = () => {
    while (index < d.length && /[\s,]/u.test(d.charAt(index))) index++;
  };
  const readNumber = (): number | undefined => {
    skip();
    numberPattern.lastIndex = index;
    const match = numberPattern.exec(d);
    if (match === null) return undefined;
    index += match[0].length;
    return Number(match[0]);
  };
  const readFlag = (): number | undefined => {
    skip();
    const char = d.charAt(index);
    if (char !== "0" && char !== "1") return undefined;
    index++;
    return char === "1" ? 1 : 0;
  };

  for (;;) {
    skip();
    if (index >= d.length) return;
    const char = d.charAt(index);
    if (/[A-Za-z]/u.test(char)) {
      if (parameterCounts[char.toLowerCase()] === undefined) return;
      command = char;
      index++;
    } else if (command === "" || command === "z" || command === "Z") {
      return;
    }
    const lower = command.toLowerCase();
    const relative = command === lower;
    const count = parameterCounts[lower] ?? 0;
    const values: number[] = [];
    for (let parameter = 0; parameter < count; parameter++) {
      const value =
        lower === "a" && (parameter === 3 || parameter === 4) ? readFlag() : readNumber();
      if (value === undefined) return;
      values.push(value);
    }
    const [a = 0, b = 0, c = 0, e = 0, f = 0, g = 0, h = 0] = values;
    const baseX = relative ? x : 0;
    const baseY = relative ? y : 0;
    const fromX = x;
    const fromY = y;
    switch (lower) {
      case "m":
        x = baseX + a;
        y = baseY + b;
        startX = x;
        startY = y;
        segments.move(x, y);
        // Further pairs after a moveto are linetos.
        command = relative ? "l" : "L";
        break;
      case "l":
        x = baseX + a;
        y = baseY + b;
        segments.line(fromX, fromY, x, y);
        break;
      case "t": {
        const reflected = previous === "q" || previous === "t";
        controlX = reflected ? 2 * x - controlX : x;
        controlY = reflected ? 2 * y - controlY : y;
        x = baseX + a;
        y = baseY + b;
        segments.quadratic(fromX, fromY, controlX, controlY, x, y);
        break;
      }
      case "h":
        x = baseX + a;
        segments.line(fromX, fromY, x, y);
        break;
      case "v":
        y = (relative ? y : 0) + a;
        segments.line(fromX, fromY, x, y);
        break;
      case "c":
        controlX = baseX + c;
        controlY = baseY + e;
        x = baseX + f;
        y = baseY + g;
        segments.cubic(fromX, fromY, baseX + a, baseY + b, controlX, controlY, x, y);
        break;
      case "s": {
        const reflected = previous === "c" || previous === "s";
        const c1x = reflected ? 2 * x - controlX : x;
        const c1y = reflected ? 2 * y - controlY : y;
        controlX = baseX + a;
        controlY = baseY + b;
        x = baseX + c;
        y = baseY + e;
        segments.cubic(fromX, fromY, c1x, c1y, controlX, controlY, x, y);
        break;
      }
      case "q":
        controlX = baseX + a;
        controlY = baseY + b;
        x = baseX + c;
        y = baseY + e;
        segments.quadratic(fromX, fromY, controlX, controlY, x, y);
        break;
      case "a":
        x = baseX + g;
        y = baseY + h;
        segments.arc(fromX, fromY, Math.abs(a), Math.abs(b), x, y);
        break;
      case "z":
        x = startX;
        y = startY;
        segments.close(fromX, fromY, x, y);
        break;
    }
    previous = lower;
    if (lower === "z") command = "";
  }
}
