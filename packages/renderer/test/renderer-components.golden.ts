import { defineGoldenSuite } from "@readmint/golden";
import type { ComponentDefinition, Layer } from "@readmint/format";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { fontAssets, goldenFonts } from "./testAssets.js";

const badge: ComponentDefinition = {
  width: 90,
  height: 26,
  props: {
    label: { type: "string", default: "build" },
    colour: { type: "color", default: "#1a7f37" },
  },
  layers: [
    { type: "rect", width: 90, height: 26, radius: 6, fill: "{{props.colour}}" },
    {
      type: "text",
      x: 0,
      y: 4,
      width: 90,
      align: "middle",
      content: "{{props.label}}",
      font: "medium",
      fontSize: 14,
      fill: "#ffffff",
    },
  ],
};

function design(layers: Layer[], data?: Readonly<Record<string, unknown>>): RenderFixture {
  return {
    design: {
      version: 0,
      canvas: { width: 200, height: 80, background: "#ffffff" },
      assets: { fonts: fontAssets },
      components: { badge },
      layers,
    },
    ...(data === undefined ? {} : { data }),
  };
}

export default defineGoldenSuite<RenderFixture>({
  name: "renderer-components",
  render: renderFixture,
  fonts: goldenFonts,
  fixtures: [
    {
      name: "component-default-props",
      scale: 2,
      input: design([{ type: "component", ref: "badge", x: 10, y: 10 }]),
    },
    {
      name: "component-bound-props-sized",
      scale: 2,
      input: design(
        [
          {
            type: "group",
            x: 10,
            y: 10,
            layout: { type: "stack", direction: "column", gap: 6 },
            children: [
              {
                type: "component",
                ref: "badge",
                height: 30,
                props: { label: "{{status.label}}", colour: "{{status.colour}}" },
              },
              { type: "component", ref: "badge", props: { label: "tests" }, rotation: 3 },
            ],
          },
        ],
        { status: { label: "failing", colour: "#cf222e" } },
      ),
    },
  ],
});
