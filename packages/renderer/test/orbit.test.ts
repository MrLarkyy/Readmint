import type { Design, Layer, Orbit } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type LayerBox, type RenderOptions } from "../src/index.js";
import { fontAssets } from "./testAssets.js";
import { apply, attributeOf, placedElements, turnOf, type Matrix } from "./svgTransforms.js";

const centre = { x: 100, y: 60 };

function design(layers: readonly Layer[], extra: Partial<Design> = {}): Design {
  return {
    version: 0,
    canvas: { width: 200, height: 120 },
    assets: { fonts: { medium: fontAssets.medium } },
    layers,
    ...extra,
  };
}

const timeline = { animation: { duration: 12_000 } } as const;

function render(input: Design, options: RenderOptions = {}): string {
  const result = renderSvg(input, options);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

function issues(input: Design, options: RenderOptions = {}) {
  const result = renderSvg(input, options);
  return result.ok ? [] : result.issues.map(({ path, code }) => ({ path, code }));
}

function orbit(extra: Partial<Orbit> = {}): Orbit {
  return { center: centre, radius: 80, radiusY: 30, angle: 20, ...extra };
}

const dot = (extra: Partial<Layer> = {}): Layer =>
  ({ type: "rect", width: 4, height: 4, fill: "#c00001", ...extra }) as Layer;

/** The first element named `name` whose `fill` is `fill` (any when undefined), with its composed transform. */
function find(svg: string, name: string, fill?: string): { matrix: Matrix; attributes: string } {
  for (const element of placedElements(svg)) {
    if (element.name !== name) continue;
    if (fill !== undefined && attributeOf(element.attributes, "fill") !== fill) continue;
    return element;
  }
  throw new Error(`no ${name} in ${svg}`);
}

const wrap = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

describe("a static orbit", () => {
  test("on a circle is one group: centre, turn, radius, turn back", () => {
    const svg = render(design([dot({ orbit: orbit({ radiusY: 80, angle: 30 }) })]));
    expect(svg).toContain(
      '<g transform="translate(100 60) rotate(30) translate(80 0) rotate(-30)"><rect x="0" y="0" width="4" height="4" fill="#c00001"/></g>',
    );
  });

  test("on an ellipse is the epicycle of the half sum and half difference of its radii", () => {
    const svg = render(design([dot({ orbit: orbit({ angle: 45 }) })]));
    expect(svg).toContain(
      '<g transform="translate(100 60) rotate(45) translate(55 0) rotate(-90) translate(25 0) rotate(45)">',
    );
  });

  test("not upright keeps a net turn of the angle", () => {
    const ellipse = render(design([dot({ orbit: orbit({ angle: 45, upright: false }) })]));
    expect(ellipse).toContain("translate(25 0) rotate(90)");
    expect(turnOf(find(ellipse, "rect").matrix)).toBeCloseTo(45, 9);
    const circle = render(design([dot({ orbit: orbit({ radiusY: 80, upright: false }) })]));
    expect(circle).toContain('<g transform="translate(100 60) rotate(20) translate(80 0)">');
  });

  test("leaves out moves and turns of 0, and writes no group when nothing is left", () => {
    const zero = { center: { x: 0, y: 0 }, radius: 0, angle: 0 };
    expect(render(design([dot({ orbit: zero })]))).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120" role="img"><rect',
    );
    expect(render(design([dot({ orbit: { ...zero, radius: 5 } })]))).toContain(
      '<g transform="translate(5 0)"><rect',
    );
  });

  test.each<[string, Layer]>([
    ["a rect", dot({ x: 3, y: -2 })],
    ["a text", { type: "text", content: "Ab", font: "medium", x: 3, y: -2 }],
    ["a group", { type: "group", x: 3, y: -2, children: [dot({ x: 0, y: 0, fill: "#00ff00" })] }],
    ["a component", { type: "component", ref: "chip", x: 3, y: -2, props: {} }],
  ])("places %s with its own x and y in the upright frame at the orbit point", (_name, layer) => {
    const angle = 137.25;
    const input = design([{ ...layer, orbit: orbit({ angle }) }], {
      components: { chip: { layers: [dot({ fill: "#00ff00" })] } },
    });
    const svg = render(input);
    const element = layer.type === "text" ? find(svg, "text") : find(svg, "rect");
    const radians = (angle * Math.PI) / 180;
    // a rect writes its x and y as attributes, a text in its spans, a group and a component translate
    const at = layer.type === "rect" ? apply(element.matrix, 3, -2) : apply(element.matrix, 0, 0);
    const offset = layer.type === "text" ? { x: 0, y: 0 } : { x: 3, y: -2 };
    expect(at.x).toBeCloseTo(centre.x + 80 * Math.cos(radians) + offset.x, 2);
    expect(at.y).toBeCloseTo(centre.y + 30 * Math.sin(radians) + offset.y, 2);
    expect(Math.abs(turnOf(element.matrix))).toBeLessThan(1e-9);
  });

  test("a fade multiplies the opacity by the depth of the angle", () => {
    const fade = { from: -0.5, to: 0.5 };
    const front = render(design([dot({ opacity: 0.8, orbit: orbit({ angle: 90, fade }) })]));
    expect(front).toContain('opacity="0.8"');
    const side = render(design([dot({ orbit: orbit({ angle: 0, fade }) })]));
    expect(side).toContain('opacity="0.5"');
    const back = render(design([dot({ orbit: orbit({ angle: -90, fade }) })]));
    expect(back).toContain('opacity="0"');
    const reversed = render(
      design([dot({ orbit: orbit({ angle: 30, fade: { from: 1, to: 0 } }) })]),
    );
    expect(reversed).toContain('opacity="0.5"');
    // fully drawn: no opacity attribute is added
    const full = render(design([dot({ orbit: orbit({ angle: 90, fade: { from: 0, to: 0.5 } }) })]));
    expect(full).not.toContain("opacity");
  });
});

describe("a moving orbit", () => {
  const moving = (extra: Partial<Orbit> = {}) => orbit({ speed: -30, ...extra });
  const layers = (extra: Partial<Orbit> = {}): Layer[] => [
    { type: "text", content: "Ab", font: "medium", x: -8, y: -6, orbit: moving(extra) },
    {
      type: "group",
      x: 2,
      y: 3,
      orbit: moving(extra),
      children: [dot({ fill: "#00ff00" })],
    },
  ];

  test("writes each turn's motion as a group of its own with a class, the static parts apart", () => {
    const svg = render(design(layers(), timeline));
    const prefix = /<svg[^>]* class="(r[0-9a-z]+)"/u.exec(svg)?.[1] ?? "";
    expect(svg).toContain(
      `<g transform="translate(100 60) rotate(20)"><g class="${prefix}a0"><g transform="translate(55 0) rotate(-40)"><g class="${prefix}a1"><g transform="translate(25 0) rotate(20)"><g class="${prefix}a0">`,
    );
    expect(svg).toContain(
      `@keyframes ${prefix}k0{0%{transform:rotate(0deg)}100%{transform:rotate(-360deg)}}`,
    );
    expect(svg).toContain(
      `@keyframes ${prefix}k1{0%{transform:rotate(0deg)}100%{transform:rotate(720deg)}}`,
    );
    expect(svg).toContain(`.${prefix}a0{animation:${prefix}k0 12000ms linear infinite}`);
    // the two layers and their four spins of each kind share two rules
    expect(svg.match(/@keyframes/gu)).toHaveLength(2);
  });

  test("stays upright on a constant ellipse, at the speed, at 64 times over the loop (sampled)", () => {
    const input = design(layers(), timeline);
    let [tilt, radial, speed] = [0, 0, 0];
    for (let index = 0; index < 64; index++) {
      const time = (12_000 * index) / 64;
      const svg = render(input, { time });
      const expected = 20 - (30 * time) / 1000;
      // the text writes its offset in its spans, the group translates its rect by its own
      const placed = [
        { element: find(svg, "text"), offset: { x: 0, y: 0 } },
        { element: find(svg, "rect", "#00ff00"), offset: { x: 2, y: 3 } },
      ];
      for (const { element, offset } of placed) {
        const point = apply(element.matrix, 0, 0);
        const [u, v] = [(point.x - offset.x - centre.x) / 80, (point.y - offset.y - centre.y) / 30];
        radial = Math.max(radial, Math.abs(Math.hypot(u, v) - 1));
        tilt = Math.max(tilt, Math.abs(turnOf(element.matrix)));
        speed = Math.max(speed, Math.abs(wrap((Math.atan2(v, u) * 180) / Math.PI - expected)));
      }
    }
    expect(tilt).toBeLessThan(0.01);
    expect(radial).toBeLessThan(1e-3);
    expect(speed).toBeLessThan(0.05);
  });

  test("not upright turns with the orbit at every time", () => {
    const input = design(layers({ upright: false, radiusY: 80 }), timeline);
    for (const time of [0, 1000, 7500, 11_999]) {
      const turn = turnOf(find(render(input, { time }), "text").matrix);
      expect(Math.abs(wrap(turn - (20 - (30 * time) / 1000)))).toBeLessThan(0.01);
    }
  });

  test("a frame at any time is what the browser plays from the CSS keyframes then", () => {
    const input = design(layers(), timeline);
    const animated = render(input);
    for (const time of [0, 1234, 6000, 9876.5]) {
      const played = playedAt(animated, time);
      const frame = render(input, { time });
      const want = [...placedElements(played)].filter((element) => element.name !== "g");
      const got = [...placedElements(frame)].filter((element) => element.name !== "g");
      expect(got.map((element) => element.name)).toEqual(want.map((element) => element.name));
      got.forEach((element, index) => {
        const other = want[index]?.matrix ?? element.matrix;
        for (let entry = 0; entry < 6; entry++)
          expect(Math.abs((element.matrix[entry] ?? 0) - (other[entry] ?? 0))).toBeLessThan(2e-3);
      });
    }
  });

  test("a fade plays as an opacity track with a keyframe every 15 degrees, the frame as the CSS", () => {
    const input = design([dot({ orbit: moving({ fade: { from: -0.5, to: 0.5 } }) })], timeline);
    const animated = render(input);
    const keyframes = /@keyframes (r[0-9a-z]+k\d+)\{(0%\{opacity[^@]*?)\}\}/u.exec(animated);
    expect(keyframes).not.toBeNull();
    const stops = cssStops(`${keyframes?.[2] ?? ""}}`);
    expect(stops.length).toBeGreaterThan(1);
    // 360 degrees of travel: 25 keyframes, some sharing a selector where the value holds
    expect(stops.map(([percent]) => percent)).toContain(4.167);
    for (const time of [0, 700, 3000, 8250]) {
      const frame = render(input, { time });
      const opacity = Number(attributeOf(find(frame, "rect").attributes, "opacity") ?? "1");
      expect(opacity).toBeCloseTo(interpolate(stops, (time / 12_000) * 100), 3);
    }
  });

  test("a fade next to the layer's own transform tracks keeps them", () => {
    const track = {
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 1, value: 10 },
      ],
    };
    const input = design(
      [dot({ animate: { x: track }, orbit: moving({ fade: { from: 0, to: 1 } }) })],
      timeline,
    );
    const svg = render(input, { time: 6000 });
    expect(svg).toContain('transform="translate(5 0)"');
    expect(svg).toMatch(/opacity="[\d.]+"/u);
  });

  test("without a timeline an unvalidated speed is ignored, as an animate is", () => {
    const svg = render(design([dot({ orbit: orbit({ speed: 30 }) })]));
    expect(svg).not.toContain("class=");
    expect(svg).toContain("rotate(20)");
  });
});

describe("bounds", () => {
  const faded = (extra: Partial<Orbit>) => dot({ opacity: 0.5, orbit: orbit(extra) });

  test("a layer of its own on a static orbit off the canvas is not written, on the canvas it is", () => {
    expect(render(design([faded({ center: { x: 400, y: 60 } })]))).not.toContain("c00001");
    expect(render(design([faded({ center: { x: 100, y: 60 } })]))).toContain("c00001");
    // the orbit point is off the canvas though the centre is on it
    expect(
      render(design([faded({ center: { x: 150, y: 60 }, angle: 0, radius: 200 })])),
    ).not.toContain("c00001");
  });

  test("a moving orbit is never left out of the animated SVG, a frame leaves it out where it is off", () => {
    const far = design([faded({ center: { x: 400, y: 60 }, speed: 30 })], timeline);
    expect(render(far)).toContain("c00001");
    expect(render(far, { time: 3000 })).not.toContain("c00001");
  });

  test("the extent of a group reaches past the furthest point of its children's ellipses", () => {
    const input = design([
      {
        type: "group",
        x: 5,
        y: 5,
        children: [dot({ x: 1, y: 2, orbit: orbit({ center: { x: 10, y: 20 }, angle: 180 }) })],
      },
    ]);
    const result = renderSvg(input, { layerBoxes: true });
    if (!result.ok) throw new Error("render failed");
    const group = result.layerBoxes?.[0] as LayerBox;
    expect(group.width).toBe(10 + 80 + 1 + 4);
    expect(group.height).toBe(20 + 30 + 2 + 4);
  });
});

describe("refusals", () => {
  test.each<[string, Partial<Orbit> | Record<string, unknown>, string, string]>([
    ["a NaN radius from the data", { radius: "{{ nan }}" }, "/layers/0/orbit/radius", "binding"],
    ["a huge radius", { radius: 1e9 }, "/layers/0/orbit/radius", "range"],
    ["a text radius", { radius: "x" }, "/layers/0/orbit/radius", "type"],
    ["a bound radius below 0", { radiusY: "{{ -1 }}" }, "/layers/0/orbit/radiusY", "range"],
    ["an angle over 360", { angle: "{{ 361 }}" }, "/layers/0/orbit/angle", "range"],
    ["a speed over 3600", { speed: "{{ 3601 }}" }, "/layers/0/orbit/speed", "range"],
    ["an upright that is no boolean", { upright: "{{ 1 }}" }, "/layers/0/orbit/upright", "type"],
    ["a centre that is no object", { center: 5 }, "/layers/0/orbit/center", "type"],
    ["a fade out of range", { fade: { from: 0, to: 2 } }, "/layers/0/orbit/fade/to", "range"],
    ["a fade with equal depths", { fade: { from: 0, to: 0 } }, "/layers/0/orbit/fade/to", "range"],
    ["a fade that is no object", { fade: [] }, "/layers/0/orbit/fade", "type"],
  ])("%s", (_name, extra, path, code) => {
    const input = design([dot({ orbit: { ...orbit(), ...extra } })], timeline);
    expect(issues(input, { data: { nan: Number.NaN } })).toEqual([{ path, code }]);
  });

  test("an orbit that is no object is a type issue", () => {
    expect(issues(design([dot({ orbit: 3 as unknown as Orbit })]))).toEqual([
      { path: "/layers/0/orbit", code: "type" },
    ]);
  });

  test.each([
    ["stack", { type: "stack", direction: "row" }],
    ["grid", { type: "grid", columns: 2 }],
  ] as const)("an orbit in a %s group is refused", (_name, layout) => {
    const group: Layer = { type: "group", layout, children: [dot(), dot({ orbit: orbit() })] };
    expect(issues(design([group]))).toEqual([{ path: "/layers/0/children/1/orbit", code: "type" }]);
  });

  test("a fade with an opacity track is refused at the fade", () => {
    const opacity = {
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 1, value: 1 },
      ],
    };
    const layer = dot({ animate: { opacity }, orbit: orbit({ fade: { from: 0, to: 1 } }) });
    expect(issues(design([layer], timeline))).toEqual([
      { path: "/layers/0/orbit/fade", code: "type" },
    ]);
  });

  test("a fade over more than four turns is refused, four turns take 97 keyframes", () => {
    const fade = { from: 0, to: 1 };
    const fast = design([dot({ orbit: orbit({ speed: 121, fade }) })], timeline);
    expect(issues(fast)).toEqual([{ path: "/layers/0/orbit/fade", code: "range" }]);
    const four = design([dot({ orbit: orbit({ speed: 120, fade }) })], timeline);
    expect(issues(four, { limits: { maxAnimationKeyframes: 6 + 97 - 1 } })).toEqual([
      { path: "/layers/0/orbit/fade", code: "too-large" },
    ]);
    expect(issues(four, { limits: { maxAnimationKeyframes: 6 + 97 } })).toEqual([]);
  });
});

/** The animated SVG with every class's transform written as the value its CSS plays at `time`. */
function playedAt(svg: string, time: number): string {
  const rules = new Map<string, readonly (readonly [number, number])[]>();
  for (const match of svg.matchAll(/@keyframes (r[0-9a-z]+k\d+)\{((?:[^{}]*\{[^{}]*\})*)\}/gu)) {
    rules.set(match[1] ?? "", cssStops(match[2] ?? ""));
  }
  const classes = new Map<string, { name: string; duration: number }>();
  for (const match of svg.matchAll(/\.(r[0-9a-z]+a\d+)\{animation:(r[0-9a-z]+k\d+) (\d+)ms/gu)) {
    classes.set(match[1] ?? "", { name: match[2] ?? "", duration: Number(match[3]) });
  }
  return svg.replace(/<g class="([^"]+)">/gu, (_tag, name: string) => {
    const rule = classes.get(name);
    const stops = rules.get(rule?.name ?? "") ?? [];
    const percent = ((time % (rule?.duration ?? 1)) / (rule?.duration ?? 1)) * 100;
    return `<g transform="rotate(${String(interpolate(stops, percent))})">`;
  });
}

/** The stops of a keyframes body: percent and the first number of the declaration. */
function cssStops(body: string): (readonly [number, number])[] {
  const stops: (readonly [number, number])[] = [];
  for (const match of body.matchAll(/([\d.%,]+)\{[a-z-]+:(?:rotate\()?(-?[\d.]+)/gu)) {
    for (const selector of (match[1] ?? "").split(","))
      stops.push([Number(selector.replace("%", "")), Number(match[2])]);
  }
  return stops.sort((a, b) => a[0] - b[0]);
}

function interpolate(stops: readonly (readonly [number, number])[], percent: number): number {
  let index = 0;
  while (index + 1 < stops.length && (stops[index + 1]?.[0] ?? 0) <= percent) index++;
  const [fromAt, from] = stops[index] ?? [0, 0];
  const [toAt, to] = stops[index + 1] ?? [fromAt, from];
  return toAt === fromAt ? from : from + ((to - from) * (percent - fromAt)) / (toAt - fromAt);
}
