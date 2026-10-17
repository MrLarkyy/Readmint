import { defineGoldenSuite } from "@readmint/golden";
import type { Layer } from "@readmint/format";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { fontAssets, goldenFonts } from "./testAssets.js";

function design(layers: Layer[], data?: Readonly<Record<string, unknown>>): RenderFixture {
  return {
    design: { version: 0, canvas: { width: 160, height: 100, background: "#ffffff" }, layers },
    ...(data === undefined ? {} : { data }),
  };
}

function box(width: number, height: number, fill: string, extra: Partial<Layer> = {}): Layer {
  return { type: "rect", width, height, fill, ...extra } as Layer;
}

export default defineGoldenSuite<RenderFixture>({
  name: "renderer-layout",
  render: renderFixture,
  fonts: goldenFonts,
  fixtures: [
    {
      name: "group-absolute",
      input: design([
        {
          type: "group",
          x: 20,
          y: 15,
          children: [
            box(60, 40, "#0969da"),
            box(60, 40, "#bf3989", { x: 40, y: 30, opacity: 0.7 }),
            {
              type: "group",
              x: 90,
              y: 0,
              rotation: 20,
              children: [box(30, 30, "#1a7f37")],
            },
          ],
        },
      ]),
    },
    {
      name: "group-clip",
      input: design([
        {
          type: "group",
          x: 30,
          y: 20,
          width: 100,
          height: 60,
          clip: true,
          children: [
            { type: "ellipse", x: -20, y: -20, width: 80, height: 80, fill: "#fb8f44" },
            { type: "ellipse", x: 60, y: 20, width: 80, height: 80, fill: "#6639ba" },
          ],
        },
        { type: "rect", x: 30, y: 20, width: 100, height: 60, fill: "none", stroke: "#24292f" },
      ]),
    },
    {
      // Every red layer lies wholly off the canvas, beyond the twice its size resvg aborts at, so none is written.
      name: "off-canvas-layers",
      input: design([
        box(60, 40, "#0969da", { x: 10, y: 10 }),
        {
          type: "group",
          x: 10,
          y: 300,
          width: 60,
          height: 40,
          clip: true,
          children: [box(80, 60, "#cf222e")],
        },
        {
          type: "group",
          x: 80,
          y: 10,
          width: 70,
          height: 40,
          clip: true,
          children: [box(40, 40, "#cf222e", { x: 400 })],
        },
        box(60, 40, "#cf222e", { x: -480, y: 10, opacity: 0.5 }),
        {
          type: "group",
          width: 160,
          height: 100,
          rotation: 60,
          children: [box(20, 20, "#1a7f37", { x: 70, y: 105, opacity: 0.6 })],
        },
      ]),
    },
    {
      // Far layers the turn, glyph and stroke bounds bring tight enough to leave out: none is written, only blue draws.
      name: "off-canvas-tight",
      input: {
        design: {
          version: 0,
          canvas: { width: 100, height: 100, background: "#ffffff" },
          assets: { fonts: { medium: fontAssets.medium } },
          layers: [
            box(20, 20, "#0969da", { x: 10, y: 10 }),
            {
              type: "group",
              width: 100,
              height: 100,
              rotation: 45,
              opacity: 0.5,
              children: [box(50, 50, "#cf222e", { x: 500, y: 500 })],
            },
            {
              type: "text",
              x: 350,
              y: 0,
              content: "Hi",
              font: "medium",
              fontSize: 300,
              fill: "#cf222e",
              opacity: 0.5,
            },
            {
              type: "path",
              x: 300,
              y: 0,
              d: "M0 0 H40 V40 H0 Z",
              fill: "none",
              stroke: "#cf222e",
              strokeWidth: 100,
              opacity: 0.5,
            },
          ],
        },
      },
    },
    {
      name: "gradient-clip-repeat",
      input: design(
        [
          {
            type: "group",
            x: 10,
            y: 10,
            layout: { type: "stack", direction: "row", gap: 10 },
            children: [
              {
                type: "group",
                width: 40,
                height: 50,
                clip: true,
                repeat: { each: "{{cards}}", as: "card" },
                children: [
                  {
                    type: "rect",
                    x: -10,
                    y: "{{card.shift}}",
                    width: 60,
                    height: 60,
                    radius: 12,
                    fill: {
                      type: "linear",
                      x2: 0,
                      y2: 1,
                      stops: [
                        { offset: 0, color: "#0969da" },
                        { offset: 1, color: "#bf3989" },
                      ],
                    },
                  },
                ],
              },
            ],
          },
          {
            type: "rect",
            x: 6,
            y: 70,
            width: 148,
            height: 20,
            radius: 6,
            fill: "none",
            strokeWidth: 4,
            stroke: {
              type: "linear",
              stops: [
                { offset: 0, color: "#0969da" },
                { offset: 1, color: "#bf3989" },
              ],
            },
          },
        ],
        { cards: [{ shift: -20 }, { shift: 0 }, { shift: 15 }] },
      ),
    },
    {
      name: "stack-row-center",
      input: design([
        {
          type: "group",
          x: 10,
          y: 10,
          height: 80,
          layout: { type: "stack", direction: "row", gap: 8, align: "center" },
          children: [
            box(30, 20, "#0969da"),
            box(30, 60, "#1a7f37"),
            box(30, 40, "#9a6700", { y: 10 }),
            box(30, 80, "#cf222e"),
          ],
        },
      ]),
    },
    {
      name: "stack-column-gap",
      input: design([
        {
          type: "group",
          x: 20,
          y: 6,
          width: 120,
          layout: { type: "stack", direction: "column", gap: 6, align: "end" },
          children: [
            box(120, 16, "#0550ae"),
            box(80, 16, "#218bff"),
            box(40, 16, "#80ccff"),
            box(100, 16, "#54aeff", { x: -10 }),
          ],
        },
      ]),
    },
    {
      name: "grid-three-columns",
      input: design([
        {
          type: "group",
          x: 10,
          y: 10,
          width: 140,
          layout: { type: "grid", columns: 3, gap: 4 },
          children: [
            box(44, 20, "#8250df"),
            box(30, 26, "#a475f9"),
            box(44, 20, "#c297ff"),
            box(20, 20, "#8250df", { x: 12 }),
            box(44, 30, "#a475f9"),
            box(44, 20, "#c297ff"),
            box(44, 14, "#8250df"),
          ],
        },
      ]),
    },
    {
      name: "stack-in-grid",
      input: design([
        {
          type: "group",
          x: 10,
          y: 10,
          layout: { type: "grid", columns: 2, gap: 10 },
          children: [0, 1, 2, 3].map((index): Layer => ({
            type: "group",
            layout: { type: "stack", direction: "row", gap: 4, align: "end" },
            children: [
              box(20, 10 + index * 8, "#2da44e"),
              box(20, 34 - index * 6, "#116329"),
              box(20, 20, "#4ac26b"),
            ],
          })),
        },
      ]),
    },
    {
      name: "repeat-in-stack",
      input: design(
        [
          {
            type: "group",
            x: 10,
            y: 10,
            height: 80,
            layout: { type: "stack", direction: "row", gap: 6, align: "end" },
            children: [
              {
                type: "rect",
                width: 16,
                height: "{{bar.value}}",
                fill: "{{bar.color}}",
                repeat: { each: "{{bars}}", as: "bar" },
              },
            ],
          },
        ],
        {
          bars: [
            { value: 20, color: "#0969da" },
            { value: 50, color: "#1a7f37" },
            { value: 80, color: "#9a6700" },
            { value: 35, color: "#cf222e" },
            { value: 65, color: "#8250df" },
            { value: 10, color: "#bf3989" },
          ],
        },
      ),
    },
    {
      name: "if-and-visible",
      input: design(
        [
          box(40, 40, "#1a7f37", { x: 10, y: 10 }),
          box(40, 40, "#cf222e", { x: 60, y: 10, visible: false }),
          box(40, 40, "#cf222e", { x: 110, y: 10, if: "{{flags.hidden}}" }),
          box(40, 40, "#0969da", { x: 60, y: 55, if: "{{flags.shown}}" }),
          box(40, 40, "#9a6700", { x: 110, y: 55, visible: "{{flags.shown}}" }),
        ],
        { flags: { hidden: false, shown: true } },
      ),
    },
    {
      // Sizes and places from the drawn width: the name fills 140 px, the underline is as long as the label (its rocket
      // is not drawn and takes no space), the long line is cut to the 140 px guide.
      name: "measured-width",
      scale: 2,
      input: {
        design: {
          version: 0,
          canvas: { width: 160, height: 100, background: "#ffffff" },
          assets: { fonts: { medium: fontAssets.medium } },
          layers: [
            {
              type: "text",
              x: 10,
              y: 2,
              content: "{{ name }}",
              font: "medium",
              fontSize: '{{ 140 / (name | textWidth("medium", 1)) | round(2) }}',
              fill: "#1f2328",
            },
            {
              type: "text",
              x: 10,
              y: 46,
              content: "{{ label }}",
              font: "medium",
              fontSize: 14,
              fill: "#1f2328",
            },
            {
              type: "rect",
              x: 10,
              y: 64,
              width: '{{ label | textWidth("medium", 14) }}',
              height: 2,
              fill: "#cf222e",
            },
            {
              type: "rect",
              x: 10,
              y: 76,
              width: 140,
              height: 14.4,
              fill: "none",
              stroke: "#d0d7de",
              strokeWidth: 1,
            },
            {
              type: "text",
              x: 10,
              y: 76,
              content: '{{ long | truncateWidth(140, "medium", 12) }}',
              font: "medium",
              fontSize: 12,
              fill: "#0969da",
            },
          ],
        },
        data: {
          name: "Readmint",
          label: "Under 🚀 line",
          long: "A push message far too long for its slot",
        },
      },
    },
    {
      // Labels on an ellipse stay upright; bars on a circle turn with it unless upright; a fade dims the back.
      name: "orbit",
      input: {
        design: {
          version: 0,
          canvas: { width: 160, height: 100, background: "#ffffff" },
          assets: { fonts: { medium: fontAssets.medium } },
          layers: [
            {
              type: "ellipse",
              x: 20,
              y: 25,
              width: 120,
              height: 50,
              fill: "none",
              stroke: "#d0d7de",
              strokeWidth: 1,
            },
            {
              type: "text",
              x: -8,
              y: -6,
              width: 16,
              align: "middle",
              content: "{{ item }}",
              font: "medium",
              fontSize: 9,
              fill: "#0969da",
              repeat: { each: '{{ ["N", "E", "S", "W", "x", "y"] }}', index: "k" },
              orbit: {
                center: { x: 80, y: 50 },
                radius: 60,
                radiusY: 25,
                angle: "{{ k * 60 - 90 }}",
                fade: { from: -1, to: 0.2 },
              },
            },
            {
              type: "group",
              repeat: { each: "{{ [0, 1, 2, 3] }}", index: "k" },
              orbit: {
                center: { x: 80, y: 50 },
                radius: 16,
                angle: "{{ k * 90 + 30 }}",
                upright: "{{ k % 2 == 0 }}",
              },
              children: [
                { type: "rect", x: -5, y: -2, width: 10, height: 4, fill: "#bf3989" },
                { type: "ellipse", x: -1, y: -1, width: 2, height: 2, fill: "#1a7f37" },
              ],
            },
          ],
        },
      },
    },
  ],
});
