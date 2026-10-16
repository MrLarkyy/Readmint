import { defineGoldenSuite } from "@readmint/golden";
import type { ComponentDefinition, Layer, Palette } from "@readmint/format";
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

const palette: Palette = {
  light: {
    bg: "#ffffff",
    panel: "#f6f8fa",
    soft: "#ddf4ff",
    line: "#d0d7de",
    ink: "#1f2328",
    accent: "#0969da",
  },
  dark: {
    bg: "#0d1117",
    panel: "#161b22",
    soft: "#388bfd40",
    line: "#30363d",
    ink: "#e6edf3",
    accent: "#2f81f7",
  },
};

/** One root instance whose `theme` picks the palette mode; every colour of the card is a token. */
const themedCard: ComponentDefinition = {
  props: { theme: { type: "enum", values: ["light", "dark"], default: "light" } },
  layers: [
    {
      type: "rect",
      x: 8,
      y: 8,
      width: 184,
      height: 64,
      radius: 8,
      fill: {
        type: "linear",
        x2: 1,
        y2: 1,
        stops: [
          { offset: 0, color: "{{ palette.soft }}" },
          { offset: 1, color: "{{ palette.panel }}" },
        ],
      },
      stroke: "{{ palette.line }}",
      strokeWidth: 2,
    },
    {
      type: "text",
      x: 20,
      y: 18,
      content: "{{ props.theme }}",
      font: "medium",
      fontSize: 16,
      fill: "{{ palette.ink }}",
    },
    {
      type: "component",
      ref: "badge",
      x: 92,
      y: 38,
      props: { label: "palette", colour: "{{ palette.accent }}" },
    },
  ],
};

function themed(theme: string): RenderFixture {
  return {
    design: {
      version: 0,
      canvas: { width: 200, height: 80, background: "{{ palette.bg }}" },
      assets: { fonts: fontAssets },
      palette,
      components: { badge, card: themedCard },
      layers: [{ type: "component", ref: "card", props: { theme } }],
    },
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
    {
      name: "let",
      scale: 2,
      input: design(
        [
          {
            type: "group",
            x: 10,
            y: 10,
            let: { label: "{{ status.label }}", wide: "{{ status.count * 30 }}" },
            children: [
              { type: "rect", width: "{{ wide }}", height: 4, radius: 2, fill: "#0969da" },
              {
                type: "component",
                ref: "badge",
                y: 12,
                let: { tone: "{{ status.count > 2 ? '#cf222e' : '#1a7f37' }}" },
                props: { label: "{{ label }} {{ wide }}", colour: "{{ tone }}" },
              },
            ],
          },
        ],
        { status: { label: "let", count: 3 } },
      ),
    },
    { name: "palette-light", scale: 2, input: themed("light") },
    { name: "palette-dark", scale: 2, input: themed("dark") },
  ],
});
