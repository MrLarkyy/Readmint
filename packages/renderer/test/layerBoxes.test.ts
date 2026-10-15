import type { Design, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type LayerBox } from "../src/index.js";
import animationSuite from "./renderer-animation.golden.js";
import components from "./renderer-components.golden.js";
import fontFormats from "./renderer-fonts-formats.golden.js";
import fonts from "./renderer-fonts.golden.js";
import images from "./renderer-images.golden.js";
import layout from "./renderer-layout.golden.js";
import shapes from "./renderer-shapes.golden.js";
import text from "./renderer-text.golden.js";

function design(layers: readonly Layer[], extra: Partial<Design> = {}): Design {
  return { version: 0, canvas: { width: 200, height: 200 }, layers, ...extra };
}

function boxes(input: Design, data: Record<string, unknown> = {}): readonly LayerBox[] | undefined {
  const result = renderSvg(input, { data, layerBoxes: true });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.layerBoxes;
}

describe("the SVG does not change with layerBoxes", () => {
  const suites = [animationSuite, components, fontFormats, fonts, images, layout, shapes, text];
  const fixtures = suites.flatMap((suite) =>
    suite.fixtures.map((fixture) => [`${suite.name}/${fixture.name}`, fixture.input] as const),
  );

  test.each(fixtures)("%s", (_name, input) => {
    const options = {
      data: input.data ?? {},
      ...(input.time === undefined ? {} : { time: input.time }),
    };
    const plain = renderSvg(input.design, options);
    const boxed = renderSvg(input.design, { ...options, layerBoxes: true });
    expect(plain.ok && boxed.ok).toBe(true);
    if (!plain.ok || !boxed.ok) return;
    expect(boxed.svg).toBe(plain.svg);
    expect(boxed.report).toEqual(plain.report);
    expect(plain.layerBoxes).toBeUndefined();
    expect(boxed.layerBoxes?.length).toBeGreaterThan(0);
  });
});

describe("layer boxes", () => {
  test("are given in paint order with each layer's pointer and canvas box", () => {
    expect(
      boxes(
        design([
          { type: "rect", x: 10, y: 20, width: 30, height: 40 },
          { type: "ellipse", x: 5, y: 5, width: 10, height: 10 },
        ]),
      ),
    ).toEqual([
      { layer: "/layers/0", x: 10, y: 20, width: 30, height: 40 },
      { layer: "/layers/1", x: 5, y: 5, width: 10, height: 10 },
    ]);
  });

  test("add the offsets of nested groups and of their layouts", () => {
    expect(
      boxes(
        design([
          {
            type: "group",
            x: 10,
            y: 10,
            children: [
              {
                type: "group",
                x: 5,
                y: 0,
                layout: { type: "stack", direction: "row", gap: 4 },
                children: [
                  { type: "rect", width: 10, height: 10 },
                  { type: "rect", width: 20, height: 10 },
                ],
              },
            ],
          },
        ]),
      ),
    ).toEqual([
      { layer: "/layers/0", x: 10, y: 10, width: 39, height: 10 },
      { layer: "/layers/0/children/0", x: 15, y: 10, width: 34, height: 10 },
      { layer: "/layers/0/children/0/children/0", x: 15, y: 10, width: 10, height: 10 },
      { layer: "/layers/0/children/0/children/1", x: 29, y: 10, width: 20, height: 10 },
    ]);
  });

  test("describe turns by their degrees and centres, innermost first", () => {
    const result = boxes(
      design([
        { type: "rect", x: 0, y: 0, width: 20, height: 10, rotation: -30 },
        {
          type: "group",
          x: 100,
          y: 100,
          width: 40,
          height: 20,
          rotation: 90,
          children: [
            {
              type: "group",
              x: 10,
              y: 0,
              width: 10,
              height: 10,
              rotation: 45.0004,
              children: [{ type: "ellipse", x: 1, y: 2, width: 4, height: 4, rotation: 10 }],
            },
          ],
        },
      ]),
    );
    const outer = { degrees: 90, cx: 120, cy: 110 };
    const inner = { degrees: 45, cx: 115, cy: 105 };
    expect(result).toEqual([
      { layer: "/layers/0", x: 0, y: 0, width: 20, height: 10, rotation: -30 },
      { layer: "/layers/1", x: 100, y: 100, width: 40, height: 20, rotation: 90 },
      {
        layer: "/layers/1/children/0",
        x: 110,
        y: 100,
        width: 10,
        height: 10,
        rotation: 45,
        groupTurns: [outer],
      },
      {
        layer: "/layers/1/children/0/children/0",
        x: 111,
        y: 102,
        width: 4,
        height: 4,
        rotation: 10,
        groupTurns: [inner, outer],
      },
    ]);
  });

  test("give every repeat copy the pointer of its layer", () => {
    expect(
      boxes(
        design([
          {
            type: "rect",
            x: "{{index * 20}}",
            width: 10,
            height: 10,
            repeat: { each: "{{list}}" },
          },
        ]),
        { list: [1, 2, 3] },
      ),
    ).toEqual([
      { layer: "/layers/0", x: 0, y: 0, width: 10, height: 10 },
      { layer: "/layers/0", x: 20, y: 0, width: 10, height: 10 },
      { layer: "/layers/0", x: 40, y: 0, width: 10, height: 10 },
    ]);
  });

  test("give the layers of a component the pointer of its instance", () => {
    const result = boxes(
      design(
        [
          {
            type: "group",
            children: [{ type: "component", ref: "badge", x: 10, y: 20 }],
          },
        ],
        {
          components: {
            badge: {
              layers: [
                { type: "rect", width: 8, height: 4 },
                { type: "component", ref: "dot", x: 2 },
              ],
            },
            dot: { layers: [{ type: "ellipse", width: 2, height: 2 }] },
          },
        },
      ),
    );
    expect(result?.map((box) => [box.layer, box.x, box.y])).toEqual([
      ["/layers/0", 0, 0],
      ["/layers/0/children/0", 10, 20],
      ["/layers/0/children/0", 10, 20],
      ["/layers/0/children/0", 12, 20],
      ["/layers/0/children/0", 12, 20],
    ]);
  });

  test("leave out layers that are not drawn", () => {
    expect(
      boxes(
        design([
          { type: "rect", width: 1, height: 1, visible: false },
          { type: "rect", width: 2, height: 2, if: "{{false}}" },
          { type: "rect", width: 3, height: 3 },
        ]),
      ),
    ).toEqual([{ layer: "/layers/2", x: 0, y: 0, width: 3, height: 3 }]);
  });

  test("are not returned for a failed render", () => {
    const result = renderSvg(design([{ type: "rect", width: "{{missing}}", height: 1 }]), {
      layerBoxes: true,
    });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("layerBoxes");
  });
});
