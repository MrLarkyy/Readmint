import type { Design } from "../src/index.js";

const common = {
  name: "Layer",
  x: 1,
  y: "{{pos.y}}",
  opacity: 0.9,
  rotation: -15,
  visible: true,
  style: "card",
  if: "{{show}}",
  repeat: { each: "{{items}}", as: "item", index: "n" },
} as const;

const fade = {
  keyframes: [
    { offset: 0, value: 0, easing: "ease-in" },
    { offset: 0.5, value: "{{peak}}", easing: { x1: 0.3, y1: -0.5, x2: 0.7, y2: 1.5 } },
    { offset: 1, value: 1 },
  ],
  duration: 500,
  delay: "{{index * 10}}",
  stagger: 40,
  easing: "ease-out",
} as const;

const tint = {
  keyframes: [
    { offset: 0, value: "#fff" },
    { offset: 1, value: "{{theme.tint}}" },
  ],
} as const;

const transforms = {
  opacity: fade,
  x: {
    keyframes: [
      { offset: 0, value: -10 },
      { offset: 1, value: "{{dx}}" },
    ],
  },
  y: {
    keyframes: [
      { offset: 0, value: 0 },
      { offset: 1, value: 5 },
    ],
    easing: "linear",
  },
  scale: {
    keyframes: [
      { offset: 0, value: -1 },
      { offset: 1, value: 2 },
    ],
    easing: "ease",
  },
  rotation: {
    keyframes: [
      { offset: 0, value: 0 },
      { offset: 1, value: 360 },
    ],
    easing: "ease-in-out",
  },
} as const;

/** Every optional property of the format set at least once; must stay valid. */
export const maximalDesign = {
  $schema:
    "https://raw.githubusercontent.com/MrLarkyy/Readmint/main/packages/format/schema/design-v0.schema.json",
  version: 0,
  title: "Maximal",
  description: "Every optional property.",
  locale: "cs",
  canvas: {
    width: 4096,
    height: "{{size.height}}",
    background: {
      type: "linear",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: "{{g.y2}}",
      stops: [
        { offset: 0, color: "#000" },
        { offset: "{{g.mid}}", color: "{{g.color}}" },
        { offset: 1, color: "{{palette.edge}}" },
      ],
    },
  },
  styles: {
    card: {
      fill: {
        type: "radial",
        cx: 0.5,
        cy: 0.5,
        r: 1,
        stops: [
          { offset: 0, color: "#fff" },
          { offset: 1, color: "#0000" },
        ],
      },
      stroke: "none",
      strokeWidth: 1,
      opacity: 1,
      font: "body",
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.4,
      letterSpacing: -0.5,
      align: "middle",
    },
  },
  assets: {
    fonts: {
      body: {
        family: "Body",
        src: "fonts/body.otf",
        weight: 400,
        style: "italic",
        licence: { embedding: "allowed", name: "OFL-1.1", reservedFontName: false },
        drawAs: "paths",
        fallback: ["symbols"],
        kerning: false,
      },
      symbols: {
        family: "Symbols",
        src: "fonts/symbols.woff2",
        licence: { embedding: "restricted" },
      },
    },
    images: { photo: { src: "images/photo.webp", width: 64, height: 64 } },
  },
  components: {
    chip: {
      description: "A chip.",
      width: 40,
      height: 16,
      props: {
        label: { type: "string", required: true, default: "chip" },
        size: { type: "number", required: false, default: 1 },
        on: { type: "boolean", default: false },
        tint: { type: "color", default: "#123456" },
        mode: { type: "enum", values: ["a", "b"], default: "a" },
        items: { type: "array", default: [1, "x", true] },
      },
      layers: [
        {
          type: "rect",
          let: { tone: "{{props.tint}}" },
          width: 40,
          height: 16,
          fill: "{{tone}}",
        },
      ],
    },
  },
  palette: {
    light: { edge: "#d0d7de", "edge-soft": "#d0d7de80" },
    dark: { edge: "#30363d", "edge-soft": "#30363d80" },
  },
  animation: { duration: 2000, loop: false },
  layers: [
    {
      type: "group",
      id: "group",
      ...common,
      let: {
        total: "{{ items | length }}",
        half: "{{ total / 2 }}",
        label: "{{ half }} of {{ total }}",
      },
      animate: transforms,
      width: 100,
      height: 100,
      clip: false,
      layout: { type: "stack", direction: "row", gap: 2, align: "end" },
      children: [
        {
          type: "rect",
          id: "rect",
          ...common,
          width: 1,
          height: 1,
          radius: 2,
          fill: "#fff",
          stroke: "#000",
          strokeWidth: 1,
          animate: { ...transforms, fill: tint, stroke: tint },
        },
        {
          type: "ellipse",
          id: "ellipse",
          ...common,
          width: 1,
          height: 1,
          fill: "#fff",
          stroke: "#000",
          strokeWidth: 1,
          animate: { fill: tint },
        },
        {
          type: "path",
          id: "path",
          ...common,
          d: "M 0,0 C 1 2 3 4 5e1 -6.5 z",
          fill: "none",
          stroke: "#000",
          strokeWidth: 1,
          animate: { draw: fade, stroke: tint },
        },
        {
          type: "text",
          id: "text",
          ...common,
          content: "{{item.name}}",
          width: 80,
          maxLines: 2,
          fill: "#fff",
          font: "body",
          fontSize: 10,
          fontWeight: 400,
          lineHeight: 1,
          letterSpacing: 0,
          align: "end",
          animate: { fill: tint, x: transforms.x },
        },
        {
          type: "image",
          id: "image",
          ...common,
          asset: "photo",
          width: 8,
          height: 8,
          fit: "cover",
          alt: "A photo",
          animate: { rotation: transforms.rotation },
        },
        {
          type: "component",
          id: "component",
          ...common,
          ref: "chip",
          width: 40,
          height: 16,
          props: {
            label: "Hi",
            size: 2,
            on: true,
            tint: "{{theme.tint}}",
            mode: "b",
            items: ["a", 2, false],
          },
          animate: { scale: transforms.scale },
        },
      ],
    },
  ],
} as const satisfies Design;
