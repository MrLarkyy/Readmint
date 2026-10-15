import type { Design } from "@readmint/format";
import { validateDesign } from "@readmint/format";
import { expect, test } from "vitest";
import { renderSvg, RenderLimits } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

/** An astral character: two UTF-16 units, one code point, one character for the format. */
const emoji = "😀";

function design(content: string): Design {
  return {
    version: 0,
    canvas: { width: 100, height: 40 },
    assets: { fonts: { m: fontAssets.medium } },
    layers: [{ type: "text", content, width: 100, font: "m" }],
  };
}

test("an emoji-heavy text the format accepts at its 10000-character limit renders", () => {
  // 10000 code points of source with a placeholder, about 20000 UTF-16 units.
  const source = `{{ 1 }}${emoji.repeat(9993)}`;
  expect([...source]).toHaveLength(10_000);
  expect(validateDesign(design(source)).ok).toBe(true);
  expect(renderSvg(design(source)).ok).toBe(true);
  // A placeholder filling in 10000 code points stays within maxTextLength.
  const filled = renderSvg(design("{{ text }}"), {
    data: { text: emoji.repeat(RenderLimits.maxTextLength) },
  });
  expect(filled.ok).toBe(true);
});

test("one character more fails validation, and filled in fails too-large", () => {
  const source = `{{ 1 }}${emoji.repeat(9994)}`;
  expect(validateDesign(design(source))).toMatchObject({
    ok: false,
    issues: [{ path: "/layers/0/content", code: "length" }],
  });
  const filled = renderSvg(design("{{ text }}"), {
    data: { text: emoji.repeat(RenderLimits.maxTextLength + 1) },
  });
  expect(filled).toMatchObject({
    ok: false,
    issues: [{ path: "/layers/0/content", code: "too-large" }],
  });
});
