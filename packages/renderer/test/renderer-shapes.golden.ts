import { defineGoldenSuite } from "@readmint/golden";
import type { Design, Layer } from "@readmint/format";
import { renderFixture, type RenderFixture } from "./renderFixture.js";

function design(layers: Layer[], extra: Partial<Design> = {}): RenderFixture {
  return {
    design: {
      version: 0,
      canvas: { width: 120, height: 80, background: "#f6f8fa" },
      layers,
      ...extra,
    },
  };
}

export default defineGoldenSuite<RenderFixture>({
  name: "renderer-shapes",
  render: renderFixture,
  fixtures: [
    {
      name: "rect-fill",
      input: design([{ type: "rect", x: 10, y: 10, width: 100, height: 60, fill: "#2ea043" }]),
    },
    {
      name: "rect-radius-stroke",
      input: design([
        {
          type: "rect",
          x: 12,
          y: 12,
          width: 96,
          height: 56,
          radius: 12,
          fill: "#ddf4ff",
          stroke: "#0969da",
          strokeWidth: 4,
        },
      ]),
    },
    {
      name: "rect-linear-gradient",
      input: design([
        {
          type: "rect",
          x: 10,
          y: 10,
          width: 100,
          height: 60,
          fill: {
            type: "linear",
            x2: 1,
            y2: 1,
            stops: [
              { offset: 0, color: "#58a6ff" },
              { offset: 0.5, color: "#bc8cff" },
              { offset: 1, color: "#f778ba" },
            ],
          },
        },
      ]),
    },
    {
      name: "ellipse-radial-gradient",
      input: design([
        {
          type: "ellipse",
          x: 20,
          y: 10,
          width: 80,
          height: 60,
          fill: {
            type: "radial",
            cx: 0.35,
            cy: 0.35,
            r: 0.7,
            stops: [
              { offset: 0, color: "#ffffff" },
              { offset: 1, color: "#1f6feb" },
            ],
          },
          stroke: "#0d1117",
          strokeWidth: 2,
        },
      ]),
    },
    {
      name: "path-stroke",
      input: design([
        {
          type: "path",
          x: 10,
          y: 10,
          d: "M0 50 L20 10 L40 50 L60 10 L80 50 L100 10",
          fill: "none",
          stroke: "#cf222e",
          strokeWidth: 3,
        },
      ]),
    },
    {
      name: "path-fill-alpha",
      input: design([
        { type: "rect", x: 10, y: 20, width: 60, height: 40, fill: "#0969da" },
        {
          type: "path",
          x: 30,
          y: 10,
          d: "m0 0 h60 v40 a20 20 0 0 1 -20 20 h-40 z",
          fill: "#ff000080",
        },
        { type: "rect", x: 50, y: 50, width: 60, height: 20, fill: "#0f08" },
      ]),
    },
    {
      name: "opacity-rotation",
      scale: 2,
      input: design([
        {
          type: "rect",
          x: 20,
          y: 25,
          width: 80,
          height: 30,
          fill: "#8250df",
          rotation: 30,
          opacity: 0.6,
        },
        {
          type: "ellipse",
          x: 40,
          y: 10,
          width: 40,
          height: 60,
          fill: "#bf8700",
          rotation: -45,
          opacity: 0.8,
        },
      ]),
    },
    {
      name: "style-reference",
      input: design(
        [
          { type: "rect", x: 10, y: 10, width: 45, height: 60, style: "card" },
          { type: "rect", x: 65, y: 10, width: 45, height: 60, style: "card", fill: "#ffebe9" },
        ],
        {
          styles: {
            card: { fill: "#dafbe1", stroke: "#1a7f37", strokeWidth: 3, opacity: 0.9 },
          },
        },
      ),
    },
    {
      name: "canvas-gradient-background",
      input: {
        design: {
          version: 0,
          canvas: {
            width: 120,
            height: 80,
            background: {
              type: "linear",
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 1,
              stops: [
                { offset: 0, color: "#0d1117" },
                { offset: 1, color: "#30363d" },
              ],
            },
          },
          layers: [{ type: "ellipse", x: 45, y: 25, width: 30, height: 30, fill: "#f0f6fc" }],
        },
      },
    },
    {
      // Bars bottom-aligned by a row stack: each copy's bounds come from its own evaluated data.
      name: "path-template-d",
      input: {
        ...design([
          {
            type: "group",
            x: 10,
            y: 10,
            height: 60,
            layout: { type: "stack", direction: "row", gap: 4, align: "end" },
            children: [
              {
                type: "path",
                d: "M0 {{ 4 | min(item) }} L6 0 L12 {{ 4 | min(item) }} V{{ item }} H0 Z",
                fill: "#2ea043",
                stroke: "#116329",
                strokeWidth: 1,
                repeat: { each: "{{ heights }}" },
              },
            ],
          },
        ]),
        data: { heights: [12, 36, 20, 60, 4, 28, 48] },
      },
    },
  ],
});
