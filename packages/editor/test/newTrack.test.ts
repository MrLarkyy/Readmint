import { readFile } from "node:fs/promises";
import { animatedProperties, type Design, type Layer } from "@readmint/format";
import { resolveRasterWasm } from "@readmint/raster";
import { initRaster } from "@readmint/raster/browser";
import { beforeAll, describe, expect, test } from "vitest";
import { createEditorState, setLayerTrack, type EditorState } from "../src/index.js";
import { findLayer } from "../src/layerAccess.js";
import { newTrack } from "../src/newTrack.js";
import { renderRasterExport } from "../src/renderRasterExport.js";

beforeAll(async () => {
  const paths = resolveRasterWasm();
  await initRaster({ resvg: await readFile(paths.resvg), webp: await readFile(paths.webp) });
});

const withLayer = (layer: Record<string, unknown>) =>
  createEditorState({
    version: 0,
    canvas: { width: 100, height: 40 },
    animation: { duration: 1000 },
    layers: [layer],
  } as unknown as Design);

async function png(state: EditorState, time: number): Promise<Buffer> {
  const output = await renderRasterExport({
    design: state.design,
    data: state.data,
    sessionAssets: state.sessionAssets,
    format: "png",
    time,
  });
  return Buffer.from(output.bytes);
}

/** A track holding `value` at both ends. */
const constant = (value: unknown) => ({
  keyframes: [
    { offset: 0, value },
    { offset: 1, value },
  ],
});

interface Case {
  readonly layer: Record<string, unknown>;
  /** The start value of every property the layer type animates; undefined where no track can start. */
  readonly starts: Readonly<Record<string, unknown>>;
}

const cases: Record<string, Case> = {
  rect: {
    layer: {
      type: "rect",
      x: 7,
      y: 3,
      rotation: 10,
      width: 10,
      height: 10,
      fill: "#abcdef",
      stroke: "#123456",
      strokeWidth: 2,
      opacity: 0.5,
    },
    starts: {
      opacity: 0.5,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      fill: "#abcdef",
      stroke: "#123456",
    },
  },
  "bound rect": {
    layer: {
      type: "rect",
      x: 20,
      y: 5,
      width: 10,
      height: 10,
      fill: "{{ '#ff0000' }}",
      opacity: "{{ 0.25 }}",
    },
    starts: {
      opacity: "{{ 0.25 }}",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      fill: "{{ '#ff0000' }}",
      stroke: undefined,
    },
  },
  ellipse: {
    layer: { type: "ellipse", x: 40, y: 10, width: 12, height: 10, fill: "#00ff00" },
    starts: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      fill: "#00ff00",
      stroke: undefined,
    },
  },
  path: {
    layer: { type: "path", d: "M60 5 L90 35", stroke: "#123456", strokeWidth: 3 },
    starts: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      fill: undefined,
      stroke: "#123456",
      draw: 1,
    },
  },
  group: {
    layer: {
      type: "group",
      x: 4,
      rotation: 12,
      children: [{ type: "rect", x: 30, y: 15, width: 16, height: 8, fill: "#202020" }],
    },
    starts: { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0 },
  },
};

/** A start value that changes the frame: what a wrong start (scale 0, draw 0, an x that moves) would render. */
const wrong: Readonly<Record<string, unknown>> = {
  opacity: 0,
  x: 5,
  y: 5,
  scale: 0,
  rotation: 45,
  fill: "#ff00ff",
  stroke: "#ff00ff",
  draw: 0,
};

describe("newTrack", () => {
  test.each(Object.entries(cases))(
    "a %s gets a track of the expected start for every property it animates",
    (_name, { layer, starts }) => {
      const found = findLayer(withLayer(layer).design, "/layers/0");
      if (found === undefined) throw new Error("no layer");
      const properties = animatedProperties(found.type).map((entry) => entry.property);
      expect(properties).toEqual(Object.keys(starts));
      for (const entry of animatedProperties(found.type)) {
        const start = starts[entry.property];
        expect(newTrack(found, entry), entry.property).toEqual(
          start === undefined ? undefined : constant(start),
        );
      }
    },
  );

  test.each(Object.entries(cases))(
    "a new track on any property of a %s draws the same pixels at 0 and 500 ms, a wrong start does not",
    async (_name, { layer, starts }) => {
      const base = withLayer(layer);
      const found = findLayer(base.design, "/layers/0");
      if (found === undefined) throw new Error("no layer");
      const frames = new Map<number, Buffer>();
      for (const time of [0, 500]) frames.set(time, await png(base, time));
      for (const entry of animatedProperties(found.type)) {
        const { property } = entry;
        if (starts[property] === undefined) continue;
        const track = newTrack(found, entry);
        const next = setLayerTrack(base, "/layers/0", property, track);
        expect(next.issues, property).toEqual([]);
        const off = setLayerTrack(base, "/layers/0", property, constant(wrong[property]));
        expect(off.issues, `${property} wrong`).toEqual([]);
        for (const [time, still] of frames) {
          expect((await png(next, time)).equals(still), `${property} at ${String(time)}`).toBe(
            true,
          );
          expect((await png(off, time)).equals(still), `${property} wrong at ${String(time)}`).toBe(
            false,
          );
        }
      }
    },
  );

  test("a fill or stroke track needs a colour on the layer: none, a gradient or no value gives none", () => {
    const entry = animatedProperties("rect").find((one) => one.property === "stroke");
    if (entry === undefined) throw new Error("no entry");
    const rect = (stroke?: unknown) =>
      ({
        type: "rect",
        width: 1,
        height: 1,
        ...(stroke === undefined ? {} : { stroke }),
      }) as unknown as Layer;
    expect(newTrack(rect(), entry)).toBeUndefined();
    expect(newTrack(rect("none"), entry)).toBeUndefined();
    expect(
      newTrack(
        rect({
          type: "linear",
          stops: [
            { offset: 0, color: "#000000" },
            { offset: 1, color: "#ffffff" },
          ],
        }),
        entry,
      ),
    ).toBeUndefined();
  });
});
