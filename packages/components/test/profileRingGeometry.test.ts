import type { Design } from "@readmint/format";
import { renderSvg } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { profileTemplates, type ProfileTemplate } from "../src/index.js";
import { loadProfile, profileFontAssets, type ProfileTheme } from "./profileDesigns.js";
import { ringDotGeometry, ringLabelGeometry, type RingPoint } from "./ringGeometry.js";
import { sampleProfileData } from "./sampleProfileData.js";

const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const themes: readonly ProfileTheme[] = ["light", "dark"];
/** Every 5 s, and both sides of the half-loop and loop ends, where the counter-rotation jumps. */
const times = [
  ...Array.from({ length: 12 }, (_, index) => index * 5000),
  29_999,
  30_000,
  30_001,
  59_999,
];
/** Times half a loop apart: the ring is then on opposite points of its ellipse, so their middle is its centre. */
const opposites: readonly (readonly [number, number])[] = [
  ...Array.from({ length: 6 }, (_, index): [number, number] => [
    index * 5000,
    index * 5000 + 30_000,
  ]),
  [29_999, 59_999],
];

interface Axes {
  readonly a: number;
  readonly b: number;
}
/** Semi-axes of the ellipse a label or dot travels: R1 + R2 and R1 - R2 of its two rotating arms. */
const yearLabels: Axes = { a: 202.43 + 112.56, b: 202.43 - 112.56 };
/** The ticks and dots of the year ring: arms of 186.285 and 103.585. */
const yearDots: Axes = { a: 186.285 + 103.585, b: 186.285 - 103.585 };
const headerDots: Axes = { a: 36.845 + 20.485, b: 36.845 - 20.485 };

type Frames = ReadonlyMap<number, readonly RingPoint[]>;
type Mutable = Record<string, unknown>;

type Svgs = ReadonlyMap<number, string>;

function renderFrames(design: Design): Svgs {
  const result = new Map<number, string>();
  for (const time of times) {
    const rendered = renderSvg(design, {
      data: sampleProfileData(),
      assets: { fonts: profileFontAssets("year-ring", design) },
      time,
    });
    if (!rendered.ok)
      throw new Error(`render at ${String(time)} ms: ${JSON.stringify(rendered.issues)}`);
    result.set(time, rendered.svg);
  }
  return result;
}

function readFrames(svgs: Svgs, read: (svg: string) => readonly RingPoint[]): Frames {
  return new Map([...svgs].map(([time, svg]) => [time, read(svg)]));
}

const frames = (design: Design, read: (svg: string) => readonly RingPoint[]): Frames =>
  readFrames(renderFrames(design), read);

const at = (sampled: Frames, time: number): readonly RingPoint[] => {
  const points = sampled.get(time);
  if (points === undefined) throw new Error(`no frame at ${String(time)} ms`);
  return points;
};

/** The shortest signed difference of two angles in degrees. */
const wrap = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

interface Drift {
  /** Largest distance from the unit ellipse, relative to its axes. */
  readonly radius: number;
  /** The same in px of the smaller axis. */
  readonly radialPx: number;
  /** Largest distance of the middle of two opposite samples from the centre taken from the first pair. */
  readonly centrePx: number;
  /** Largest turn of the composed transform, in degrees (0 = upright). */
  readonly tilt: number;
  /** Largest deviation of the angle travelled on the ellipse from -6 deg/s, in degrees. */
  readonly speed: number;
  /** Labels with no sample at 0 or 30 s, which the check cannot place. */
  readonly missing: number;
}

/** How far the points of `sampled` leave one fixed ellipse of semi-axes `a` and `b`, upright, at -360 deg per loop. */
function drift(sampled: Frames, { a, b }: Axes): Drift {
  const labels = at(sampled, 0).map((point) => point.label);
  let [radius, centrePx, tilt, speed, missing] = [0, 0, 0, 0, 0];
  for (const label of labels) {
    // a mutated design may hide a label for a moment: such a sample is skipped
    const sample = (time: number): RingPoint | undefined =>
      at(sampled, time).find((point) => point.label === label);
    const middle = (pair: readonly [number, number]): readonly [number, number] | undefined => {
      const [early, late] = [sample(pair[0]), sample(pair[1])];
      return early && late ? [(early.x + late.x) / 2, (early.y + late.y) / 2] : undefined;
    };
    const centre = middle(opposites[0] as readonly [number, number]);
    if (centre === undefined) {
      missing++;
      continue;
    }
    const [cx, cy] = centre;
    for (const pair of opposites) {
      const [mx, my] = middle(pair) ?? centre;
      centrePx = Math.max(centrePx, Math.hypot(mx - cx, my - cy));
    }
    let previous: { time: number; angle: number } | undefined;
    for (const time of [...sampled.keys()].sort((x, y) => x - y)) {
      const point = sample(time);
      if (point === undefined) {
        previous = undefined;
        continue;
      }
      const [u, v] = [(point.x - cx) / a, (point.y - cy) / b];
      radius = Math.max(radius, Math.abs(Math.hypot(u, v) - 1));
      tilt = Math.max(tilt, Math.abs(wrap(point.degrees)));
      const angle = (Math.atan2(v, u) * 180) / Math.PI;
      if (previous !== undefined) {
        const travelled = wrap(angle - previous.angle + (6 * (time - previous.time)) / 1000);
        speed = Math.max(speed, Math.abs(travelled));
      }
      previous = { time, angle };
    }
  }
  return { radius, radialPx: radius * Math.min(a, b), centrePx, tilt, speed, missing };
}

function expectConstantRing(measured: Drift): void {
  expect(measured.missing).toBe(0);
  expect(measured.radius).toBeLessThan(1e-3);
  expect(measured.centrePx).toBeLessThan(0.05);
  expect(measured.tilt).toBeLessThan(0.01);
  expect(measured.speed).toBeLessThan(0.05);
}

const yearLabelFrames = (design: Design): Frames =>
  frames(design, (svg) => ringLabelGeometry(svg, months));

describe("year ring month labels", () => {
  test.each(themes)("keep a constant radius and stay upright over the loop (%s)", (theme) => {
    const svgs = renderFrames(loadProfile("year-ring", "year", theme));
    const sampled = readFrames(svgs, (svg) => ringLabelGeometry(svg, months));
    for (const time of times) expect(at(sampled, time).map((label) => label.label)).toEqual(months);
    expectConstantRing(drift(sampled, yearLabels));
    // they do travel: half a loop apart a label sits on the other side of the ring
    const first = [at(sampled, 0)[0], at(sampled, 30_000)[0]] as [RingPoint, RingPoint];
    expect(Math.abs(first[0].x - first[1].x)).toBeGreaterThan(100);

    // the ticks and dots of the same renders sit on their own ellipse, upright
    const dots = readFrames(svgs, ringDotGeometry);
    expect(at(dots, 0).length).toBeGreaterThan(300);
    for (const time of times) expect(at(dots, time).length).toBe(at(dots, 0).length);
    expectConstantRing(drift(dots, yearDots));
  });
});

/** The groups whose rotation track has the four keyframes of the counter-rotation, found by walking the design. */
function counterRotations(node: unknown, found: Mutable[] = []): readonly Mutable[] {
  if (Array.isArray(node)) for (const child of node) counterRotations(child, found);
  else if (node !== null && typeof node === "object") {
    const record = node as Mutable;
    const track = (record["animate"] as { rotation?: Mutable } | undefined)?.rotation;
    if ((track?.["keyframes"] as unknown[] | undefined)?.length === 4) found.push(record);
    for (const child of Object.values(record)) counterRotations(child, found);
  }
  return found;
}

const trackOf = (group: Mutable): Mutable => (group["animate"] as { rotation: Mutable }).rotation;

describe("the geometry check", () => {
  const mutants: readonly [string, (group: Mutable) => void][] = [
    ["an eased counter-rotation", (group) => void (trackOf(group)["easing"] = "ease")],
    [
      "a counter-rotation turning once per loop with no jump",
      (group) =>
        void (trackOf(group)["keyframes"] = [
          { offset: 0, value: 0 },
          { offset: 1, value: 360 },
        ]),
    ],
    [
      "a counter-rotation pivot moved by 1 px",
      (group) => {
        group["width"] = 4;
        group["height"] = 4;
      },
    ],
    [
      "a missing inner rotation track",
      (group) => {
        const inner = (group["children"] as Mutable[])[0] as Mutable;
        expect((inner["animate"] as Mutable)["rotation"]).toBeDefined();
        delete (inner["animate"] as Mutable)["rotation"];
      },
    ],
  ];

  test.each(mutants)("fails on %s", (_name, mutate) => {
    const design = structuredClone(loadProfile("year-ring", "year", "light"));
    const groups = counterRotations(design);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) mutate(group);
    const measured = drift(yearLabelFrames(design), yearLabels);
    expect(measured.radialPx > 0.5 || measured.tilt > 0.1).toBe(true);
  });
});

describe("year ring header rotating parts", () => {
  test.each(themes)("keep their radius and stay upright over the loop (%s)", (theme) => {
    const sampled = frames(loadProfile("year-ring", "header", theme), ringDotGeometry);
    expect(at(sampled, 0).length).toBeGreaterThan(300);
    for (const time of times) expect(at(sampled, time).length).toBe(at(sampled, 0).length);
    expectConstantRing(drift(sampled, headerDots));
  });
});

/** Whether an `animate.rotation` object (a static `rotation` is a number or an expression) is anywhere in `node`. */
function animatesRotation(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(animatesRotation);
  if (node === null || typeof node !== "object") return false;
  const record = node as Mutable;
  const track = (record["animate"] as { rotation?: unknown } | undefined)?.rotation;
  if (track !== null && typeof track === "object") return true;
  return Object.values(record).some(animatesRotation);
}

describe("rotation tracks", () => {
  test("the detector finds a track whatever its key order and ignores a static rotation", () => {
    const track = {
      easing: "ease",
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 1, value: 1 },
      ],
    };
    expect(animatesRotation({ children: [{ animate: { rotation: track } }] })).toBe(true);
    expect(animatesRotation({ children: [{ rotation: "{{ 90 }}", animate: { x: track } }] })).toBe(
      false,
    );
    expect(animatesRotation({ rotation: 90 })).toBe(false);
  });

  test("only the year ring year and header animate rotation", () => {
    const rotating = new Set<string>();
    for (const [template, sections] of Object.entries(profileTemplates))
      for (const section of sections)
        for (const theme of themes) {
          const design = loadProfile(template as ProfileTemplate, section, theme);
          if (animatesRotation(design)) rotating.add(`${template}/${section}`);
        }
    expect([...rotating].sort()).toEqual(["year-ring/header", "year-ring/year"]);
  });
});
