import type { Design } from "@readmint/format";
import { expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { imageAssets } from "./testAssets.js";

const imageName = Object.keys(imageAssets)[0] ?? "";

function design(colour: string, width: number): Design {
  return {
    version: 0,
    canvas: { width: 100, height: 100 },
    assets: { images: imageAssets },
    layers: [
      {
        type: "rect",
        width: 10,
        height: 10,
        fill: {
          type: "linear",
          stops: [
            { offset: 0, color: colour },
            { offset: 1, color: "#bf3989" },
          ],
        },
      },
      {
        type: "group",
        width,
        height: 20,
        clip: true,
        children: [{ type: "rect", width: 40, height: 40, fill: colour }],
      },
      { type: "image", asset: imageName, width: 20, height: 20 },
    ],
  } as Design;
}

function render(source: Design): string {
  const result = renderSvg(source);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

const definedIds = (svg: string) => [...svg.matchAll(/\sid="([^"]*)"/gu)].map((m) => m[1] ?? "");
const referencedIds = (svg: string) =>
  [...svg.matchAll(/(?:url\(#|href="#)([^)"]+)/gu)].map((m) => m[1] ?? "");

test("two different designs inlined into one page refer only to their own definitions", () => {
  const a = render(design("#0969da", 30));
  const b = render(design("#1a7f37", 31));
  for (const svg of [a, b]) {
    const own = new Set(definedIds(svg));
    expect(own.size).toBeGreaterThanOrEqual(2);
    expect(referencedIds(svg).length).toBeGreaterThanOrEqual(2);
    for (const id of referencedIds(svg)) expect(own.has(id)).toBe(true);
  }
  const shared = definedIds(a).filter((id) => definedIds(b).includes(id));
  expect(shared).toEqual([]);
});

test("ids are byte-identical across renders and never contain the placeholder", () => {
  const first = render(design("#0969da", 30));
  expect(render(design("#0969da", 30))).toBe(first);
  expect(first).not.toContain("\u0001");
  for (const id of definedIds(first))
    expect(id).toMatch(/^d[0-9a-z]{7}-[gcsi][0-9a-z]{7}(?:-\d+)?$/u);
});

test("a control character in a design text cannot be taken for the placeholder", () => {
  const source = design("#0969da", 30);
  const svg = render({ ...source, title: "a\u0001b" });
  expect(svg).not.toContain("\u0001");
  expect(svg).toContain("<title>ab</title>");
});
