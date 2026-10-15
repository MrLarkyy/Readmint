import type { Design } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

const design: Design = {
  version: 0,
  canvas: { width: 100, height: 40 },
  assets: { fonts: { medium: fontAssets.medium } },
  layers: [
    { type: "text", content: "one", font: "medium" },
    { type: "text", y: 20, content: "two", font: "medium" },
  ],
};

describe("renderText", () => {
  test("every text asks for geometric precision so Chromium on Linux keeps fractional advances", () => {
    const result = renderSvg(design);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const texts = result.svg.match(/<text [^>]*>/gu) ?? [];
    expect(texts).toHaveLength(2);
    for (const text of texts) expect(text).toContain(' text-rendering="geometricPrecision"');
  });
});
