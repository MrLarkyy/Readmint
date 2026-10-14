import { describe, expect, test } from "vitest";
import { validateDesign } from "../src/index.js";

const keyframes = (from: unknown, to: unknown) => [
  { offset: 0, value: from },
  { offset: 1, value: to },
];

function design(layers: unknown[], extra: Record<string, unknown> = {}) {
  return {
    version: 0,
    canvas: { width: 10, height: 10 },
    animation: { duration: 1000 },
    layers,
    ...extra,
  };
}

function issues(value: unknown) {
  const result = validateDesign(value);
  return result.ok ? [] : result.issues.map(({ path, code }) => ({ path, code }));
}

const rect = (animate: unknown) => ({ type: "rect", width: 1, height: 1, animate });

describe("the timeline", () => {
  test("animate without a root animation is reported once at /animation", () => {
    const withoutTimeline = {
      version: 0,
      canvas: { width: 10, height: 10 },
      layers: [
        rect({ opacity: { keyframes: keyframes(0, 1) } }),
        rect({ x: { keyframes: keyframes(0, 1) } }),
      ],
    };
    expect(issues(withoutTimeline)).toEqual([{ path: "/animation", code: "missing-property" }]);
  });

  test("a timeline without any animate is valid", () => {
    expect(issues(design([{ type: "rect", width: 1, height: 1 }]))).toEqual([]);
  });

  test.each([
    [{ duration: 0 }, "/animation/duration", "range"],
    [{ duration: 60_001 }, "/animation/duration", "range"],
    [{ duration: 1.5 }, "/animation/duration", "type"],
    [{ duration: "{{d}}" }, "/animation/duration", "type"],
    [{ duration: 10, loop: "yes" }, "/animation/loop", "type"],
    [{ loop: true }, "/animation/duration", "missing-property"],
  ])("animation %j fails at %s with %s", (animation, path, code) => {
    expect(issues(design([], { animation }))).toEqual([{ path, code }]);
  });
});

describe("tracks", () => {
  test("decreasing offsets fail with range at the offset", () => {
    const track = {
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 0.6, value: 1 },
        { offset: 0.6, value: 0 },
        { offset: 0.4, value: 1 },
      ],
    };
    expect(issues(design([rect({ opacity: track })]))).toEqual([
      { path: "/layers/0/animate/opacity/keyframes/3/offset", code: "range" },
    ]);
  });

  test("draw over path data with an arc fails with pattern", () => {
    const path = {
      type: "path",
      d: "M0 0 a 5 5 0 0 1 10 0",
      animate: { draw: { keyframes: keyframes(0, 1) } },
    };
    expect(issues(design([path]))).toEqual([{ path: "/layers/0/animate/draw", code: "pattern" }]);
    const straight = { ...path, d: "M0 0 L 10 0" };
    expect(issues(design([straight]))).toEqual([]);
  });

  test("draw on a rect is an unknown property", () => {
    expect(issues(design([rect({ draw: { keyframes: keyframes(0, 1) } })]))).toEqual([
      { path: "/layers/0/animate/draw", code: "unknown-property" },
    ]);
  });

  test("fill on a group or an image is an unknown property", () => {
    const fill = { fill: { keyframes: keyframes("#000", "#fff") } };
    expect(issues(design([{ type: "group", children: [], animate: fill }]))).toEqual([
      { path: "/layers/0/animate/fill", code: "unknown-property" },
    ]);
  });

  test("33 keyframes fail with count", () => {
    const many = Array.from({ length: 33 }, (_, index) => ({ offset: index / 32, value: 0 }));
    expect(issues(design([rect({ x: { keyframes: many } })]))).toEqual([
      { path: "/layers/0/animate/x/keyframes", code: "count" },
    ]);
  });

  test.each([
    [{ x1: 1.5, y1: 0, x2: 1, y2: 1 }, "/x1", "range"],
    [{ x1: 0, y1: 10.5, x2: 1, y2: 1 }, "/y1", "range"],
    [{ x1: 0, y1: 0, x2: 1 }, "/y2", "missing-property"],
    ["bounce", "", "enum"],
    ["{{easing}}", "", "enum"],
  ])("easing %j fails at easing%s with %s", (easing, at, code) => {
    const track = { keyframes: keyframes(0, 1), easing };
    expect(issues(design([rect({ y: track })]))).toEqual([
      { path: `/layers/0/animate/y/easing${at}`, code },
    ]);
  });

  test.each([
    ["opacity", 1.5, "range"],
    ["scale", 101, "range"],
    ["rotation", -361, "range"],
    ["x", 100_001, "range"],
    ["fill", "#ggg", "pattern"],
  ])("a %s keyframe value %j fails with %s", (property, value, code) => {
    expect(
      issues(
        design([
          rect({ [property]: { keyframes: keyframes(property === "fill" ? "#000" : 0, value) } }),
        ]),
      ),
    ).toEqual([{ path: `/layers/0/animate/${property}/keyframes/1/value`, code }]);
  });

  test("timing is bindable, offsets are literal", () => {
    const bound = {
      keyframes: keyframes("{{a}}", "{{b}}"),
      duration: "{{d}}",
      delay: "{{(week * 7 + day) * 8}}",
      stagger: "{{s}}",
    };
    expect(issues(design([rect({ scale: bound })]))).toEqual([]);
    const boundOffset = {
      keyframes: [
        { offset: "{{o}}", value: 0 },
        { offset: 1, value: 1 },
      ],
    };
    expect(issues(design([rect({ x: boundOffset })]))).toEqual([
      { path: "/layers/0/animate/x/keyframes/0/offset", code: "type" },
    ]);
  });

  test.each([
    ["delay", 60_001, "range"],
    ["stagger", -1, "range"],
    ["duration", 0, "range"],
    ["delay", 0.5, "type"],
  ])("%s %j fails with %s", (key, value, code) => {
    const track = { keyframes: keyframes(0, 1), [key]: value };
    expect(issues(design([rect({ opacity: track })]))).toEqual([
      { path: `/layers/0/animate/opacity/${key}`, code },
    ]);
  });

  test("layers inside groups and component definitions are checked", () => {
    const backwards = {
      keyframes: [
        { offset: 0.5, value: 0 },
        { offset: 0.2, value: 1 },
      ],
    };
    const value = design([{ type: "group", children: [rect({ x: backwards })] }], {
      components: { chip: { layers: [rect({ y: backwards })] } },
    });
    expect(issues(value)).toEqual([
      { path: "/layers/0/children/0/animate/x/keyframes/1/offset", code: "range" },
      { path: "/components/chip/layers/0/animate/y/keyframes/1/offset", code: "range" },
    ]);
  });
});
