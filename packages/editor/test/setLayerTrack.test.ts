import { animatedProperties, DesignLimits, type Design, type Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { getAt } from "../src/designPointer.js";
import {
  createEditorState,
  exportDesign,
  importDesign,
  setLayerTrack,
  setTimeline,
} from "../src/index.js";
import { findLayer } from "../src/layerAccess.js";
import { newTrack } from "../src/newTrack.js";
import { editState, rectPointer } from "./formatEdits.js";

const state = editState();
const animateOf = (s: { design: unknown }) =>
  (getAt(s.design, rectPointer) as { animate?: Record<string, unknown> }).animate ?? {};
const dunder = ["__pro", "to__"].join("");

const opacity = {
  keyframes: [
    { offset: 0, value: 0 },
    { offset: 1, value: 1 },
  ],
};

function ok(property: string, track: unknown) {
  const next = setLayerTrack(state, rectPointer, property, track);
  expect(next.issues).toEqual([]);
  return next;
}

function refused(property: string, track: unknown, pointer = rectPointer) {
  const next = setLayerTrack(state, pointer, property, track);
  expect(next.design).toBe(state.design);
  expect(next.issues).toHaveLength(1);
  return next.issues[0];
}

describe("setLayerTrack", () => {
  test("add, edit and remove a track; the other tracks, orbit and let stay by identity", () => {
    const added = ok("opacity", opacity);
    expect(Object.keys(animateOf(added))).toEqual(["x", "opacity"]);
    expect(animateOf(added)["x"]).toBe(animateOf(state)["x"]);
    const edited = setLayerTrack(added, rectPointer, "opacity", {
      keyframes: [
        { offset: 0, value: 0.25 },
        { offset: 0.5, value: 1, easing: "ease-in" },
        { offset: 1, value: 0.5 },
      ],
      easing: { x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 },
    });
    expect(edited.issues).toEqual([]);
    const layer = getAt(edited.design, rectPointer) as Record<string, unknown>;
    const before = getAt(state.design, rectPointer) as Record<string, unknown>;
    expect(layer["orbit"]).toBe(before["orbit"]);
    expect(layer["let"]).toBe(before["let"]);
    const removed = setLayerTrack(edited, rectPointer, "opacity", undefined);
    expect(removed.issues).toEqual([]);
    expect(animateOf(removed)["x"]).toBe(animateOf(state)["x"]);
    expect(Object.keys(animateOf(removed))).toEqual(["x"]);
  });

  test("removing the last track drops animate", () => {
    const only = setLayerTrack(state, rectPointer, "x", undefined);
    expect(only.issues).toEqual([]);
    expect(Object.hasOwn(getAt(only.design, rectPointer) as object, "animate")).toBe(false);
  });

  test("a track on a layer without animate creates it", () => {
    const withoutX = setLayerTrack(state, rectPointer, "x", undefined);
    const added = setLayerTrack(withoutX, rectPointer, "opacity", opacity);
    expect(added.issues).toEqual([]);
    expect(Object.keys(animateOf(added))).toEqual(["opacity"]);
  });

  test("the file round-trips and cycles stays the number", async () => {
    const next = ok("opacity", opacity);
    const imported = await importDesign(exportDesign(next.design));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value).toEqual(next.design);
    const x = animateOf({ design: imported.value })["x"] as {
      cycles: number;
      keyframes: unknown[];
    };
    expect(x.cycles).toBe(3);
    expect(x.keyframes).toHaveLength(2);
  });

  test("the same values give the same design and no change", () => {
    const x = structuredClone(animateOf(state)["x"]);
    expect(setLayerTrack(state, rectPointer, "x", x).design).toBe(state.design);
    expect(setLayerTrack(state, rectPointer, "opacity", undefined).design).toBe(state.design);
  });

  test.each(["scale", "rotation", "y", "fill", "stroke"])(
    "a %s track is allowed on a rect",
    (property) => {
      const value =
        property === "fill" || property === "stroke" ? "#ff0000" : property === "scale" ? 1 : 0;
      const track = {
        keyframes: [
          { offset: 0, value },
          { offset: 1, value },
        ],
      };
      expect(ok(property, track).design).not.toBe(state.design);
    },
  );

  test("refuses an unknown property, a property the type lacks, prototype names and no layer", () => {
    expect(refused("blur", opacity)?.message).toContain("cannot animate");
    expect(refused("draw", opacity)?.message).toContain("cannot animate");
    for (const name of ["constructor", "prototype", "toString", "hasOwnProperty", dunder]) {
      expect(refused(name, opacity)?.message).toContain("cannot animate");
    }
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(refused("opacity", opacity, "/layers/9")?.message).toContain("no layer");
    expect(refused("opacity", opacity, "/canvas")?.message).toContain("no layer");
  });

  test("refuses fill on a group", () => {
    const next = setLayerTrack(state, "/layers/0", "fill", {
      keyframes: [
        { offset: 0, value: "#000000" },
        { offset: 1, value: "#ffffff" },
      ],
    });
    expect(next.design).toBe(state.design);
    expect(next.issues).toHaveLength(1);
  });

  test.each([null, 3, "x", [], {}, { keyframes: "no" }, { keyframes: {} }])(
    "refuses the non-track %j",
    (track) => {
      refused("opacity", track);
    },
  );

  test("refuses a sparse list of a million keyframes by its length, fast and unread", () => {
    let reads = 0;
    const keyframes = new Proxy(new Array<unknown>(1_000_000), {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/u.test(key)) reads++;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const started = performance.now();
    const issue = refused("opacity", { keyframes });
    expect(issue?.message).toContain(String(DesignLimits.maxTrackKeyframes));
    expect(reads).toBe(0);
    expect(performance.now() - started).toBeLessThan(200);
  });

  test("refuses 33 and 1 keyframes and accepts 32 and 2", () => {
    const make = (count: number) => ({
      keyframes: Array.from({ length: count }, (_, i) => ({ offset: i / 40, value: 0.5 })),
    });
    refused("opacity", make(DesignLimits.maxTrackKeyframes + 1));
    refused("opacity", make(DesignLimits.minTrackKeyframes - 1));
    expect(ok("opacity", make(DesignLimits.maxTrackKeyframes)).design).not.toBe(state.design);
    expect(ok("opacity", make(DesignLimits.minTrackKeyframes)).design).not.toBe(state.design);
  });

  test("refuses decreasing offsets with the format message and path", () => {
    const issue = refused("opacity", {
      keyframes: [
        { offset: 0.8, value: 0 },
        { offset: 0.2, value: 1 },
      ],
    });
    expect(issue?.message).toContain("must not decrease");
    expect(issue?.path).toBe(`${rectPointer}/animate/opacity/keyframes/1/offset`);
  });

  test.each([1.5, -0.1, NaN, Infinity, -Infinity, "0.5"])("refuses the offset %j", (offset) => {
    refused("opacity", {
      keyframes: [
        { offset, value: 0 },
        { offset: 1, value: 1 },
      ],
    });
  });

  test.each([Infinity, NaN, 2, -1, {}, [], true])("refuses the opacity value %j", (value) => {
    refused("opacity", {
      keyframes: [
        { offset: 0, value },
        { offset: 1, value: 1 },
      ],
    });
  });

  test.each([
    "bounce",
    { x1: 2, y1: 0, x2: 0, y2: 0 },
    { x1: "0", y1: 0, x2: 0, y2: 0 },
    { x1: 0, y1: 0, x2: 0 },
    { x1: NaN, y1: 0, x2: 0, y2: 0 },
    { x1: 0, y1: 99, x2: 0, y2: 0 },
    5,
  ])("refuses the easing %j", (easing) => {
    refused("opacity", { keyframes: opacity.keyframes, easing });
    refused("opacity", {
      keyframes: [
        { offset: 0, value: 0, easing },
        { offset: 1, value: 1 },
      ],
    });
  });

  test.each([0, 1.5, 1001, "3", NaN, Infinity, -1])("refuses cycles %j", (cycles) => {
    refused("opacity", { ...opacity, cycles });
  });

  test("accepts cycles 1 and 1000 and keeps them as numbers", () => {
    for (const cycles of [1, 1000]) {
      const track = animateOf(ok("opacity", { ...opacity, cycles }))["opacity"] as {
        cycles: number;
      };
      expect(track.cycles).toBe(cycles);
    }
  });

  test("refuses a track without a timeline with the format issue", () => {
    const bare = setTimeline(setLayerTrack(state, rectPointer, "x", undefined), undefined);
    expect(bare.issues).toEqual([]);
    const next = setLayerTrack(bare, rectPointer, "opacity", opacity);
    expect(next.design).toBe(bare.design);
    expect(next.issues[0]?.message).toMatch(/animation|timeline/u);
  });

  test("refuses a track with durations and delays outside the format's ranges", () => {
    refused("opacity", { ...opacity, duration: 0 });
    refused("opacity", { ...opacity, duration: 60_001 });
    refused("opacity", { ...opacity, delay: -1 });
    refused("opacity", { ...opacity, stagger: Infinity });
  });
});

describe("newTrack", () => {
  const withLayer = (layer: Record<string, unknown>) =>
    createEditorState({
      version: 0,
      canvas: { width: 100, height: 40 },
      animation: { duration: 1000 },
      layers: [layer],
    } as unknown as Design);

  test.each([
    ["rect", { type: "rect", width: 10, height: 10, fill: "#abcdef", opacity: 0.5, x: 7 }],
    ["rect", { type: "rect", width: 10, height: 10, fill: "none", stroke: "{{ x }}" }],
    ["ellipse", { type: "ellipse", width: 10, height: 10 }],
    ["path", { type: "path", d: "M0 0 L10 10", stroke: "#123456" }],
    ["group", { type: "group", children: [], rotation: 12 }],
  ])("every property of a %s gets a track the format accepts", (_name, layer) => {
    let current = withLayer(layer);
    const found = findLayer(current.design, "/layers/0");
    if (found === undefined) throw new Error("no layer");
    for (const entry of animatedProperties(found.type)) {
      const next = setLayerTrack(
        current,
        "/layers/0",
        entry.property,
        newTrack(findLayer(current.design, "/layers/0") as Layer, entry),
      );
      expect(next.issues, entry.property).toEqual([]);
      expect(next.design).not.toBe(current.design);
      current = next;
    }
  });
});
