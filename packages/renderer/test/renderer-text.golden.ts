import { defineGoldenSuite } from "@readmint/golden";
import type { Layer } from "@readmint/format";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { fontAssets, goldenFonts } from "./testAssets.js";

function design(layers: Layer[], data?: unknown, height = 80): RenderFixture {
  return {
    design: {
      version: 0,
      canvas: { width: 200, height, background: "#ffffff" },
      assets: { fonts: fontAssets },
      layers,
    },
    data,
  };
}

/** A thin outline of a text box, so the goldens show where the layout put it. */
function guide(x: number, y: number, width: number, height: number): Layer {
  return { type: "rect", x, y, width, height, fill: "none", stroke: "#d0d7de", strokeWidth: 1 };
}

export default defineGoldenSuite<RenderFixture>({
  name: "renderer-text",
  render: renderFixture,
  fonts: goldenFonts,
  fixtures: [
    {
      name: "text-single-line",
      scale: 2,
      input: design([
        {
          type: "text",
          x: 10,
          y: 20,
          content: "Readmint",
          font: "medium",
          fontSize: 32,
          fill: "#1f2328",
        },
      ]),
    },
    {
      name: "text-wrap",
      scale: 2,
      input: design(
        [
          guide(10, 8, 120, 120),
          {
            type: "text",
            x: 10,
            y: 8,
            width: 120,
            content:
              "Greedy wrapping keeps  two spaces and breaks Supercalifragilistic words\nhard break",
            font: "medium",
            fontSize: 14,
            fill: "#1f2328",
          },
        ],
        undefined,
        140,
      ),
    },
    {
      name: "text-align-middle-end",
      scale: 2,
      input: design([
        guide(10, 10, 180, 24),
        {
          type: "text",
          x: 10,
          y: 10,
          width: 180,
          content: "middle",
          align: "middle",
          font: "medium",
          fontSize: 20,
        },
        guide(10, 44, 180, 24),
        {
          type: "text",
          x: 10,
          y: 44,
          width: 180,
          content: "end",
          align: "end",
          font: "medium",
          fontSize: 20,
        },
      ]),
    },
    {
      name: "text-weight-800",
      scale: 2,
      input: design([
        { type: "text", x: 10, y: 6, content: "Medium 500", font: "medium", fontSize: 24 },
        {
          type: "text",
          x: 10,
          y: 40,
          content: "ExtraBold 800",
          font: "medium",
          fontWeight: 800,
          fontSize: 24,
        },
      ]),
    },
    {
      name: "text-spacing-line-height",
      scale: 2,
      input: design(
        [
          guide(10, 6, 180, 86),
          {
            type: "text",
            x: 10,
            y: 6,
            content: "letter spacing\nline height 1.6",
            font: "medium",
            fontSize: 18,
            letterSpacing: 2,
            lineHeight: 1.6,
            fill: "#0969da",
          },
        ],
        undefined,
        100,
      ),
    },
    {
      name: "text-gradient-fill",
      scale: 2,
      input: design([
        {
          type: "text",
          x: 10,
          y: 14,
          content: "Gradient",
          font: "extraBold",
          fontSize: 40,
          fill: {
            type: "linear",
            stops: [
              { offset: 0, color: "#8250df" },
              { offset: 1, color: "#e85aad" },
            ],
          },
        },
      ]),
    },
    {
      name: "text-binding",
      scale: 2,
      input: design(
        [
          {
            type: "text",
            x: 10,
            y: 10,
            content: "Hello, {{user.name}}!\n{{user.stars}} stars",
            font: "medium",
            fontSize: "{{size}}",
            fill: "{{colour}}",
          },
        ],
        { user: { name: "Octocat", stars: 1234 }, size: 22, colour: "#1a7f37" },
      ),
    },
  ],
});
