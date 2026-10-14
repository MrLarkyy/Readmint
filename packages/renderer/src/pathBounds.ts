export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
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

/**
 * A box containing the path, for layout only: the hull of every end and control point; an arc adds a box that
 * surely contains its ellipse (no trigonometry, so every engine computes the same numbers). One pass over `d`.
 * Undefined when the data holds no point.
 */
export function pathBounds(d: string): Bounds | undefined {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const include = (x: number, y: number) => {
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  };
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
    if (index >= d.length) break;
    const char = d.charAt(index);
    if (/[A-Za-z]/u.test(char)) {
      if (parameterCounts[char.toLowerCase()] === undefined) break;
      command = char;
      index++;
    } else if (command === "" || command === "z" || command === "Z") {
      break;
    }
    const lower = command.toLowerCase();
    const relative = command === lower;
    const count = parameterCounts[lower] ?? 0;
    const values: number[] = [];
    for (let parameter = 0; parameter < count; parameter++) {
      const value =
        lower === "a" && (parameter === 3 || parameter === 4) ? readFlag() : readNumber();
      if (value === undefined) return finish(box);
      values.push(value);
    }
    const [a = 0, b = 0, c = 0, e = 0, f = 0, g = 0, h = 0] = values;
    const baseX = relative ? x : 0;
    const baseY = relative ? y : 0;
    switch (lower) {
      case "m":
        x = baseX + a;
        y = baseY + b;
        startX = x;
        startY = y;
        include(x, y);
        // Further pairs after a moveto are linetos.
        command = relative ? "l" : "L";
        break;
      case "l":
      case "t": {
        if (lower === "t") {
          const reflected = previous === "q" || previous === "t";
          controlX = reflected ? 2 * x - controlX : x;
          controlY = reflected ? 2 * y - controlY : y;
          include(controlX, controlY);
        }
        x = baseX + a;
        y = baseY + b;
        include(x, y);
        break;
      }
      case "h":
        x = baseX + a;
        include(x, y);
        break;
      case "v":
        y = (relative ? y : 0) + a;
        include(x, y);
        break;
      case "c":
        include(baseX + a, baseY + b);
        controlX = baseX + c;
        controlY = baseY + e;
        include(controlX, controlY);
        x = baseX + f;
        y = baseY + g;
        include(x, y);
        break;
      case "s": {
        const reflected = previous === "c" || previous === "s";
        include(reflected ? 2 * x - controlX : x, reflected ? 2 * y - controlY : y);
        controlX = baseX + a;
        controlY = baseY + b;
        include(controlX, controlY);
        x = baseX + c;
        y = baseY + e;
        include(x, y);
        break;
      }
      case "q":
        controlX = baseX + a;
        controlY = baseY + b;
        include(controlX, controlY);
        x = baseX + c;
        y = baseY + e;
        include(x, y);
        break;
      case "a": {
        const endX = baseX + g;
        const endY = baseY + h;
        includeArc(include, x, y, endX, endY, Math.abs(a), Math.abs(b));
        x = endX;
        y = endY;
        break;
      }
      case "z":
        x = startX;
        y = startY;
        break;
    }
    previous = lower;
    if (lower === "z") command = "";
  }
  return finish(box);
}

/**
 * The arc's ellipse, radii scaled up as SVG does when they cannot reach the end point, has a centre within the
 * largest radius R of both end points, so the arc lies within 2R of each; the bound uses only the chord length.
 */
function includeArc(
  include: (x: number, y: number) => void,
  x: number,
  y: number,
  endX: number,
  endY: number,
  rx: number,
  ry: number,
): void {
  include(endX, endY);
  const small = Math.min(rx, ry);
  if (small === 0) return;
  const dx = endX - x;
  const dy = endY - y;
  const halfChord = Math.sqrt(dx * dx + dy * dy) / 2;
  const radius = Math.max(rx, ry) * Math.max(1, halfChord / small);
  include(Math.max(x, endX) - 2 * radius, Math.max(y, endY) - 2 * radius);
  include(Math.min(x, endX) + 2 * radius, Math.min(y, endY) + 2 * radius);
}

function finish(box: Bounds): Bounds | undefined {
  return box.minX === Infinity ? undefined : { ...box };
}
