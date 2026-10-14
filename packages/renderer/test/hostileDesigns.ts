import type { Design } from "@readmint/format";
import type { RenderFixture } from "./renderFixture.js";
import { fontAssets, imageAssets } from "./testAssets.js";

const attack = `"/><script>alert(1)</script><foreignObject onload="alert(2)">&amp;' javascript:alert(3) ]]> {{`;

/**
 * Code points XML 1.0 forbids, as GitHub free texts may carry them: C0 controls, U+FFFE / U+FFFF, a lone high and a
 * lone low surrogate, and a reversed (so unpaired) surrogate pair.
 */
const xmlInvalid = "\u0000\u0001\u0008\u000B\u000C\u001B\uFFFE\uFFFFx\uD800y\uDC00z\uDC00\uD800";

/** Designs and data that try to smuggle markup, scripts or references through every string the SVG carries. */
export const hostileFixtures: { name: string; input: RenderFixture }[] = [
  {
    name: "text from data",
    input: {
      design: {
        version: 0,
        title: attack,
        description: attack,
        canvas: { width: 200, height: 60 },
        assets: { fonts: { f: fontAssets.medium } },
        layers: [
          { type: "text", content: "{{user.bio}} and {{user.name}}", font: "f", width: 180 },
        ],
      },
      data: { user: { bio: attack, name: "</text></svg><svg onload=alert(4)>" } },
    },
  },
  {
    name: "image alt and webp",
    input: {
      design: {
        version: 0,
        canvas: { width: 60, height: 60 },
        assets: { images: imageAssets },
        layers: [
          { type: "image", asset: "webp", width: 20, height: 40, fit: "cover", alt: attack },
          { type: "image", asset: "gif", x: 30, width: 16, height: 16, alt: "a & b < c" },
        ],
      },
    },
  },
  {
    name: "font family breaking out of css",
    input: {
      design: {
        version: 0,
        canvas: { width: 100, height: 40 },
        assets: {
          fonts: {
            f: {
              ...fontAssets.medium,
              family: `M"};}</style><script>alert(5)</script><style>@import url(https://evil.example/x.css);{'\\`,
            },
          },
        },
        layers: [{ type: "text", content: "x", font: "f" }],
      },
    },
  },
  {
    name: "colours and paths from data",
    input: {
      design: {
        version: 0,
        canvas: { width: 100, height: 100, background: "{{bg}}" },
        layers: [
          {
            type: "rect",
            width: 10,
            height: 10,
            fill: {
              type: "linear",
              stops: [
                { offset: 0, color: "{{c}}" },
                { offset: 1, color: "#000" },
              ],
            },
          },
          { type: "path", d: "M0 0 L10 10", stroke: "{{c}}" },
        ],
      },
      data: { bg: "#ffffffff", c: "#abc" },
    },
  },
  {
    name: "XML-invalid characters",
    input: {
      design: {
        version: 0,
        title: `t${xmlInvalid}`,
        description: `d${xmlInvalid}`,
        canvas: { width: 200, height: 60 },
        assets: {
          fonts: { f: { ...fontAssets.medium, family: `Montserrat${xmlInvalid}` } },
          images: { gif: imageAssets.gif },
        },
        layers: [
          { type: "text", content: "{{user.bio}}", font: "f", width: 180 },
          { type: "image", asset: "gif", width: 16, height: 16, alt: `a${xmlInvalid}` },
          { type: "path", d: "M0\u000B0L10\u000C10", stroke: "#000" },
        ],
      },
      data: { user: { bio: `bio${xmlInvalid}end` } },
    },
  },
  {
    // The format types weight and style; an unvalidated design (an editor object) may hold strings there.
    name: "unvalidated font weight and style",
    input: {
      design: {
        version: 0,
        canvas: { width: 100, height: 40 },
        assets: {
          fonts: {
            f: {
              ...fontAssets.medium,
              weight: '400" onload="alert(7)',
              style:
                "normal}</style><script>alert(8)</script><style>@import url(https://evil.example/x.css);{",
            },
          },
        },
        layers: [{ type: "text", content: "x", font: "f" }],
      } as unknown as Design,
    },
  },
];

/** A design the format refuses but the renderer may still be handed (an editor object): it must stay inert. */
export const unvalidatedDesign = {
  version: 0,
  canvas: { width: 50, height: 50 },
  layers: [{ type: "path", d: `M0 0" onload="alert(6)`, fill: "#000" }],
} as unknown as Design;
