import type { Animation, AnimationTrack, Bindable, Colour, Design, Layer } from "@readmint/format";
import type { RenderFixture } from "./renderFixture.js";
import { fontAssets } from "./testAssets.js";

function track<T>(
  from: Bindable<T>,
  to: Bindable<T>,
  extra: Omit<AnimationTrack<T>, "keyframes"> = {},
): AnimationTrack<T> {
  return {
    keyframes: [
      { offset: 0, value: from },
      { offset: 1, value: to },
    ],
    ...extra,
  };
}

function design(width: number, height: number, animation: Animation, layers: Layer[]): Design {
  return {
    version: 0,
    canvas: { width, height, background: "#ffffff" },
    assets: { fonts: fontAssets },
    animation,
    layers,
  };
}

/** Every track kind over a rect, an ellipse, a group and a text; the tracks end before the timeline does. */
const tracks = design(240, 120, { duration: 1600 }, [
  {
    type: "rect",
    x: 10,
    y: 10,
    width: 40,
    height: 40,
    fill: "#0969da",
    animate: {
      opacity: track(0.2, 1, { duration: 800 }),
      x: track(0, 60, { duration: 1200 }),
      rotation: track(0, 90, { duration: 1200 }),
    },
  },
  {
    type: "ellipse",
    x: 10,
    y: 66,
    width: 44,
    height: 44,
    fill: "#1a7f37",
    stroke: "#24292f",
    strokeWidth: 3,
    animate: {
      scale: track(0.5, 1.2, { duration: 1200 }),
      fill: track("#1a7f37", "#bf3989", { duration: 1200 }),
      stroke: track("#24292f", "#fb8500cc", { duration: 1200 }),
    },
  },
  {
    type: "group",
    x: 130,
    y: 8,
    rotation: -10,
    animate: {
      y: track(0, 30, { duration: 1200 }),
      opacity: track(1, 0.4, { delay: 400, duration: 800 }),
    },
    children: [
      { type: "rect", width: 30, height: 20, fill: "#cf222e" },
      { type: "rect", x: 36, width: 30, height: 20, radius: 6, fill: "#8250df" },
    ],
  },
  {
    type: "text",
    x: 130,
    y: 78,
    content: "Readmint",
    font: "medium",
    fontSize: 22,
    animate: { fill: track("#1f2328", "#8250df", { duration: 1200, easing: "ease-in-out" }) },
  },
]);

/** A stroke drawn on over lines and curves, once (the last frame holds). */
const draw = design(260, 100, { duration: 1000, loop: false }, [
  {
    type: "path",
    d: "M10 50 L60 12 L110 50 Q160 92 210 50 C226 34 240 66 250 50",
    fill: "none",
    stroke: "#0969da",
    strokeWidth: 4,
    animate: { draw: track(0, 1) },
  },
]);

/** Subpaths of different lengths: each draws from its own start at the pace of the longest; the short ones finish first. */
const drawMulti = design(260, 110, { duration: 1000, loop: false }, [
  {
    type: "path",
    d: "M10 15 L250 15 M10 45 L130 45 M10 95 L70 65 L130 95 Z",
    fill: "none",
    stroke: "#8250df",
    strokeWidth: 4,
    animate: { draw: track(0, 1) },
  },
]);

const easings: readonly AnimationTrack<number>["easing"][] = [
  "linear",
  "ease",
  "ease-in-out",
  { x1: 0.3, y1: -0.6, x2: 0.7, y2: 1.6 },
];

/** Rects racing to the right under different easings; the last overshoots its end and its fade is clamped. */
const easing = design(200, 140, { duration: 1000 }, [
  ...easings.map((curve, index): Layer => ({
    type: "rect",
    x: 10,
    y: 10 + index * 26,
    width: 20,
    height: 20,
    fill: "#1f6feb",
    animate: {
      x: track(0, 160, curve === undefined ? {} : { easing: curve }),
      ...(index === 3
        ? { opacity: track(0.3, 1, { easing: { x1: 0.2, y1: 2, x2: 0.4, y2: 2 } }) }
        : {}),
    },
  })),
  {
    type: "rect",
    x: 10,
    y: 114,
    width: 20,
    height: 20,
    fill: "#bf3989",
    animate: {
      x: {
        keyframes: [
          { offset: 0, value: 0, easing: "ease-in" },
          { offset: 0.5, value: 80, easing: { x1: 0, y1: 0, x2: 0.2, y2: 1 } },
          { offset: 1, value: 160 },
        ],
      },
    },
  },
]);

const greens = ["#9be9a8", "#40c463", "#30a14e", "#216e39"];

/** A 7 x 4 calendar whose cells appear one after another (stagger 40 ms) with opacity, scale and fill. */
const calendar = design(120, 80, { duration: 1500 }, [
  {
    type: "group",
    x: 9,
    y: 9,
    layout: { type: "grid", columns: 7, gap: 3 },
    children: [
      {
        type: "rect",
        width: 12,
        height: 12,
        radius: 2,
        fill: "{{item}}",
        repeat: { each: "{{cells}}" },
        animate: {
          opacity: track(0, 1, { duration: 300, stagger: 40 }),
          scale: track(0.3, 1, { duration: 300, stagger: 40, easing: "ease-out" }),
          fill: track<Colour>("#ebedf0", "{{item}}", { duration: 300, stagger: 40 }),
        },
      },
    ],
  },
]);

const cells = Array.from({ length: 28 }, (_, index) => greens[(index * 3 + (index >> 2)) % 4]);

/**
 * Eight letters travelling once round an ellipse, upright, dimmed at the back by a fade; a pulsing dot on the same
 * ellipse; a bar on a circle the other way round, turning with it (not upright).
 */
const orbit = design(240, 140, { duration: 2000 }, [
  {
    type: "ellipse",
    x: 30,
    y: 30,
    width: 180,
    height: 80,
    fill: "none",
    stroke: "#d0d7de",
    strokeWidth: 1,
  },
  {
    type: "text",
    x: -10,
    y: -8,
    width: 20,
    align: "middle",
    content: "{{ item }}",
    font: "medium",
    fontSize: 12,
    fill: "#0969da",
    repeat: { each: '{{ ["A", "B", "C", "D", "E", "F", "G", "H"] }}', index: "k" },
    orbit: {
      center: { x: 120, y: 70 },
      radius: 90,
      radiusY: 40,
      angle: "{{ k * 45 }}",
      speed: 180,
      fade: { from: -0.6, to: 0.4 },
    },
  },
  {
    type: "ellipse",
    x: -3,
    y: -3,
    width: 6,
    height: 6,
    fill: "#cf222e",
    orbit: { center: { x: 120, y: 70 }, radius: 90, radiusY: 40, angle: 22.5, speed: 180 },
    animate: { scale: track(1, 2) },
  },
  {
    type: "group",
    orbit: { center: { x: 120, y: 70 }, radius: 24, angle: 0, speed: -180, upright: false },
    children: [{ type: "rect", x: -8, y: -3, width: 16, height: 6, fill: "#8250df" }],
  },
]);

/**
 * Tracks playing one cycle several times (RM-143): a pulse that jumps back at each seam, a bounce that ends where it
 * starts, a cycle whose keyframes do not reach its start and end (the holds), and staggered copies of a delayed run.
 */
const cycles = design(240, 100, { duration: 1200 }, [
  {
    type: "rect",
    x: 10,
    y: 10,
    width: 40,
    height: 40,
    fill: "#0969da",
    animate: {
      opacity: track(1, 0.2, { duration: 300, cycles: 4 }),
      fill: track<Colour>("#0969da", "#8250df", { duration: 300, cycles: 4 }),
    },
  },
  {
    type: "ellipse",
    x: 70,
    y: 30,
    width: 24,
    height: 24,
    fill: "#1a7f37",
    animate: {
      y: {
        keyframes: [
          { offset: 0, value: 0, easing: "ease-out" },
          { offset: 0.5, value: -24, easing: "ease-in" },
          { offset: 1, value: 0 },
        ],
        duration: 400,
        cycles: 3,
      },
    },
  },
  {
    type: "rect",
    x: 120,
    y: 15,
    width: 30,
    height: 30,
    fill: "#cf222e",
    animate: {
      scale: {
        keyframes: [
          { offset: 0.25, value: 1 },
          { offset: 0.75, value: 1.5 },
        ],
        duration: 400,
        cycles: 3,
        easing: "ease-in-out",
      },
    },
  },
  {
    type: "rect",
    x: "{{ 170 + item * 22 }}",
    y: 60,
    width: 16,
    height: 30,
    fill: "#bf3989",
    repeat: { each: "{{ [0, 1, 2] }}" },
    animate: {
      opacity: {
        keyframes: [
          { offset: 0, value: 0.2 },
          { offset: 0.5, value: 1 },
          { offset: 1, value: 0.2 },
        ],
        duration: 200,
        delay: 100,
        stagger: 150,
        cycles: 2,
      },
    },
  },
]);

/** The animated designs of the golden frames, with the frame times each is pinned at. */
export const animationDesigns: readonly {
  readonly name: string;
  readonly input: RenderFixture;
  readonly times: readonly number[];
}[] = [
  { name: "tracks", input: { design: tracks }, times: [0, 400, 800, 1200] },
  { name: "draw", input: { design: draw }, times: [0, 500, 1000] },
  { name: "draw-multi", input: { design: drawMulti }, times: [500] },
  { name: "easing", input: { design: easing }, times: [300] },
  { name: "calendar", input: { design: calendar, data: { cells } }, times: [0, 300, 600, 1200] },
  { name: "orbit-speed", input: { design: orbit }, times: [0, 500, 1000] },
  { name: "cycles", input: { design: cycles }, times: [0, 150, 300, 400, 650, 1000] },
];
