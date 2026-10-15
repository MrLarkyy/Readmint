import type { Design } from "@readmint/format";
import { expect, test } from "vitest";
import { attachAsset, createEditorState, EditorLimits, newDesign } from "../src/index.js";
import { testFonts } from "./testFonts.js";
import { testImages } from "./testImages.js";

const state = createEditorState({
  ...newDesign(),
  assets: {
    fonts: {
      local: { family: "Local", src: "fonts/local.ttf", licence: { embedding: "allowed" } },
      inline: {
        family: "Inline",
        src: "data:font/ttf;base64,AAAA",
        licence: { embedding: "allowed" },
      },
    },
    images: {
      logo: { src: "logo.png" },
      inline: { src: "data:image/png;base64,AAAA" },
      avatar: { src: "{{repo.avatar}}" },
    },
  },
} satisfies Design);

test("a file for an asset given by path is the preview's for the session", () => {
  const font = attachAsset(state, "fonts", "local", testFonts.ttf.bytes);
  expect(font.issues).toEqual([]);
  expect(font.sessionAssets.fonts?.local).toBe(testFonts.ttf.bytes);
  const image = attachAsset(state, "images", "logo", testImages.png.bytes);
  expect(image.sessionAssets.images?.logo).toBe(testImages.png.bytes);
  expect(image.design).toBe(state.design);
});

test.each([
  ["fonts", "inline", /embedded in the design/u],
  ["images", "inline", /embedded in the design/u],
  ["images", "avatar", /bound to data/u],
] as const)("a file for the %s asset %s is refused, as the CLI reads none", (kind, id, message) => {
  const next = attachAsset(state, kind, id, testImages.png.bytes);
  expect(next.sessionAssets).toBe(state.sessionAssets);
  expect(next.issues).toMatchObject([{ source: "asset", message, path: `/assets/${kind}/${id}` }]);
});

test("an unknown asset or an oversized file is refused", () => {
  expect(attachAsset(state, "images", "constructor", testImages.png.bytes).issues).toMatchObject([
    { message: "no such asset" },
  ]);
  const big = attachAsset(state, "images", "logo", new Uint8Array(EditorLimits.maxImageBytes + 1));
  expect(big.sessionAssets).toBe(state.sessionAssets);
  expect(big.issues).toMatchObject([{ message: /more than the 4194304 allowed/u }]);
});
