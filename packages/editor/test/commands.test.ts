import { DesignLimits, type Design } from "@readmint/format";
import { describe, expect, test } from "vitest";
import {
  addLayer,
  createEditorState,
  exportDesign,
  moveLayer,
  newDesign,
  removeLayer,
  reorderLayer,
  resizeLayer,
  selectLayer,
  setLayerProperty,
  type EditorState,
} from "../src/index.js";

function state(layers: Design["layers"], extra: Partial<Design> = {}): EditorState {
  return createEditorState({ ...newDesign(), layers, ...extra });
}

const rect = { type: "rect", id: "a", x: 10, y: 10, width: 20, height: 20 } as const;

describe("addLayer", () => {
  test("appends a layer with a unique id and selects it", () => {
    const next = addLayer(addLayer(state([]), "rect"), "rect");
    expect(next.design.layers.map((layer) => layer.id)).toEqual(["rect1", "rect2"]);
    expect(next.selection).toBe("/layers/1");
    expect(next.issues).toEqual([]);
  });

  test("adds into a group", () => {
    const next = addLayer(state([{ type: "group", children: [] }]), "ellipse", "/layers/0");
    expect(next.design.layers[0]).toMatchObject({
      children: [{ type: "ellipse", id: "ellipse1" }],
    });
    expect(next.selection).toBe("/layers/0/children/0");
  });

  test("refuses a text without a font, and adding into a non-group", () => {
    const empty = state([rect]);
    const text = addLayer(empty, "text");
    expect(text.design).toBe(empty.design);
    expect(text.issues).toMatchObject([{ source: "design", message: /needs a font/u }]);
    expect(addLayer(empty, "rect", "/layers/0").design).toBe(empty.design);
  });
});

describe("moveLayer", () => {
  test("writes whole numbers", () => {
    const next = moveLayer(state([rect]), "/layers/0", 2.4, -3.6);
    expect(next.design.layers[0]).toMatchObject({ x: 12, y: 6 });
    expect(next.issues).toEqual([]);
  });

  test("starts from 0 for a layer without x/y and clamps to the format's range", () => {
    const next = moveLayer(state([{ type: "rect", width: 1, height: 1 }]), "/layers/0", 5, 1e9);
    expect(next.design.layers[0]).toMatchObject({ x: 5, y: 100_000 });
  });

  test("never moves a bound coordinate", () => {
    const before = state([{ ...rect, x: "{{n}}" }]);
    const next = moveLayer(before, "/layers/0", 5, 5);
    expect(next.design).toBe(before.design);
    expect(next.issues).toMatchObject([{ path: "/layers/0/x", message: /bound/u }]);
  });

  test("never moves a layer a stack layout places", () => {
    const before = state([
      { type: "group", layout: { type: "stack", direction: "row" }, children: [rect] },
    ]);
    const next = moveLayer(before, "/layers/0/children/0", 5, 5);
    expect(next.design).toBe(before.design);
    expect(next.issues).toMatchObject([{ message: /layout/u }]);
  });

  test("refuses a pointer that names no layer, and a delta that is not a number", () => {
    const before = state([rect]);
    expect(moveLayer(before, "/layers/3", 1, 1).issues).toHaveLength(1);
    expect(moveLayer(before, "/canvas", 1, 1).design).toBe(before.design);
    expect(moveLayer(before, "/layers/0", Number.NaN, 1).design).toBe(before.design);
  });
});

describe("resizeLayer", () => {
  test("writes whole sizes of at least 1", () => {
    const next = resizeLayer(state([rect]), "/layers/0", { x: 4.6, width: 0.2, height: 33.5 });
    expect(next.design.layers[0]).toMatchObject({ x: 5, y: 10, width: 1, height: 34 });
  });

  test("a text sets only its width, a path is refused", () => {
    const text = state([{ type: "text", content: "a", font: "f" }], {
      assets: { fonts: { f: { family: "F", src: "f.ttf", licence: { embedding: "allowed" } } } },
    });
    expect(resizeLayer(text, "/layers/0", { width: 50, height: 80 }).design.layers[0]).toEqual({
      type: "text",
      content: "a",
      font: "f",
      width: 50,
    });
    const path = state([{ type: "path", d: "M0 0L1 1" }]);
    expect(resizeLayer(path, "/layers/0", { width: 5 }).design).toBe(path.design);
  });

  test("never changes a bound size, nor the x/y of a layout-placed layer", () => {
    const bound = state([{ ...rect, width: "{{w}}" }]);
    expect(resizeLayer(bound, "/layers/0", { width: 50 }).design).toBe(bound.design);
    const stacked = state([
      { type: "group", layout: { type: "stack", direction: "row" }, children: [rect] },
    ]);
    const next = resizeLayer(stacked, "/layers/0/children/0", {
      x: 0,
      y: 0,
      width: 30,
      height: 30,
    });
    expect(next.design.layers[0]).toMatchObject({ children: [{ x: 10, y: 10, width: 30 }] });
  });
});

describe("a layer on an orbit", () => {
  const orbit = { center: { x: 50, y: 50 }, radius: 30, radiusY: 10, angle: "{{ 45 }}" };
  const placed = { ...rect, orbit };

  test("keeps its orbit as it is when another property is set or it is moved", () => {
    let next = setLayerProperty(state([placed]), "/layers/0", "fill", "#ff0000");
    next = moveLayer(next, "/layers/0", 3, -2);
    expect(next.issues).toEqual([]);
    expect(next.design.layers[0]).toEqual({ ...placed, x: 13, y: 8, fill: "#ff0000" });
    expect((next.design.layers[0] as typeof placed).orbit).toBe(orbit);
  });
});

describe("setLayerProperty", () => {
  test("sets literals and bindings, removes with undefined", () => {
    let next = setLayerProperty(state([rect]), "/layers/0", "fill", "#ff0000");
    next = setLayerProperty(next, "/layers/0", "width", "{{size}}");
    next = setLayerProperty(next, "/layers/0", "x", undefined);
    expect(next.design.layers[0]).toEqual({
      type: "rect",
      id: "a",
      y: 10,
      width: "{{size}}",
      height: 20,
      fill: "#ff0000",
    });
  });

  test("an invalid result leaves the state unchanged and reports the design issues", () => {
    const before = state([rect]);
    const next = setLayerProperty(before, "/layers/0", "width", -5);
    expect(next.design).toBe(before.design);
    expect(next.issues).toMatchObject([{ source: "design", path: "/layers/0/width" }]);
    expect(setLayerProperty(before, "/layers/0", "colour", "#fff").design).toBe(before.design);
  });

  test("refuses prototype keys and the type", () => {
    const before = state([rect]);
    expect(setLayerProperty(before, "/layers/0", "__proto__", {}).design).toBe(before.design);
    expect(setLayerProperty(before, "/layers/0", "type", "ellipse").design).toBe(before.design);
    expect(({} as Record<string, unknown>).width).toBeUndefined();
  });

  test("edits the canvas", () => {
    const next = setLayerProperty(state([]), "/canvas", "width", 640);
    expect(next.design.canvas.width).toBe(640);
  });

  test("a later success clears the issues", () => {
    const failed = setLayerProperty(state([rect]), "/layers/0", "width", -5);
    expect(setLayerProperty(failed, "/layers/0", "width", 5).issues).toEqual([]);
  });
});

describe("reorderLayer, removeLayer, selectLayer", () => {
  const three = state([
    { ...rect, id: "a" },
    { ...rect, id: "b" },
    { ...rect, id: "c" },
  ]);

  test("reorder moves the layer and its selection", () => {
    const next = reorderLayer(selectLayer(three, "/layers/0"), "/layers/0", 2);
    expect(next.design.layers.map((layer) => layer.id)).toEqual(["b", "c", "a"]);
    expect(next.selection).toBe("/layers/2");
  });

  test("reorder clears a selection on a sibling that moved", () => {
    const next = reorderLayer(selectLayer(three, "/layers/1"), "/layers/0", 2);
    expect(next.selection).toBeUndefined();
  });

  test("reorder refuses an index out of range", () => {
    expect(reorderLayer(three, "/layers/0", 3).design).toBe(three.design);
    expect(reorderLayer(three, "/layers/0", -1).issues).toHaveLength(1);
  });

  test("remove drops the layer and the selection", () => {
    const next = removeLayer(selectLayer(three, "/layers/2"), "/layers/1");
    expect(next.design.layers.map((layer) => layer.id)).toEqual(["a", "c"]);
    expect(next.selection).toBeUndefined();
  });

  test("select refuses a pointer that names no layer", () => {
    expect(selectLayer(three, "/layers/9").selection).toBeUndefined();
    expect(selectLayer(three, "/canvas").issues).toHaveLength(1);
    expect(selectLayer(selectLayer(three, "/layers/1"), undefined).selection).toBeUndefined();
  });
});

describe("every edit keeps the design file within maxSourceLength", () => {
  /** The design with an image whose data URI leaves exactly `spare` characters of the file free. */
  function nearlyFull(spare: number): EditorState {
    const base = state([rect]);
    const prefix = "data:image/png;base64,";
    const withAsset = (src: string): Design => ({
      ...base.design,
      assets: { images: { filler: { src } } },
    });
    const overhead = exportDesign(withAsset(`${prefix}A`)).length;
    const design = withAsset(
      `${prefix}${"A".repeat(DesignLimits.maxSourceLength - spare - overhead + 1)}`,
    );
    expect(exportDesign(design).length).toBe(DesignLimits.maxSourceLength - spare);
    return createEditorState(design);
  }

  test("an edit that would make the file too long is refused; the design is unchanged", () => {
    const full = nearlyFull(60);
    const named = setLayerProperty(full, "/layers/0", "name", "n".repeat(50));
    expect(named.design).toBe(full.design);
    expect(named.issues).toMatchObject([
      {
        source: "design",
        message: new RegExp(
          `^the design file would be 41943[0-9]{2} characters long, more than the ${String(DesignLimits.maxSourceLength)} a design may have$`,
          "u",
        ),
      },
    ]);
    expect(addLayer(full, "rect").design).toBe(full.design);
    expect(setLayerProperty(full, "/layers/0", "name", "n").issues).toEqual([]);
  });
});
