import { DesignLimits } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { paletteEdits, setLayerProperty, setPalette } from "../src/index.js";
import { editState } from "./formatEdits.js";

const state = editState();
const entries = paletteEdits.paletteEntries(state.design.palette);

function refused(next: readonly unknown[]) {
  const result = setPalette(state, next as paletteEdits.PaletteEntries);
  expect(result.design).toBe(state.design);
  expect(result.issues).toHaveLength(1);
  return result.issues[0]?.message ?? "";
}

describe("setPalette", () => {
  test("replaces the palette and keeps the rest of the design", () => {
    const next = setPalette(state, paletteEdits.addToken(entries));
    expect(next.issues).toEqual([]);
    expect(Object.keys(next.design.palette?.["dark"] ?? {})).toEqual(["bg", "ink", "token1"]);
    expect(next.design.layers).toBe(state.design.layers);
  });

  test("the same palette is no change", () => {
    expect(setPalette(state, entries).design).toBe(state.design);
  });

  test("past maxPaletteModes and maxPaletteTokens is refused before anything is built", () => {
    refused(
      Array.from({ length: DesignLimits.maxPaletteModes + 1 }, (_, i) => [`m${String(i)}`, []]),
    );
    const tokens = Array.from({ length: DesignLimits.maxPaletteTokens + 1 }, (_, i) => [
      `t${String(i)}`,
      "#000",
    ]);
    refused([["light", tokens]]);
    const big = new Array<unknown>(1_000_000).fill(["m", []]);
    const start = performance.now();
    refused(big);
    expect(performance.now() - start).toBeLessThan(50);
  });

  test("the caps themselves are taken", () => {
    const tokens = Array.from({ length: DesignLimits.maxPaletteTokens }, (_, i) => [
      `t${String(i)}`,
      "#000",
    ]);
    const modes = Array.from({ length: DesignLimits.maxPaletteModes }, (_, i) => [
      `m${String(i)}`,
      tokens,
    ]);
    const plain = setLayerProperty(state, "/canvas", "background", "#ffffff");
    const free = setLayerProperty(plain, "/layers/0/children/0", "fill", "#000000");
    const next = setPalette(free, modes as unknown as paletteEdits.PaletteEntries);
    expect(next.issues.map((issue) => issue.message)).toEqual([]);
  });

  test("a duplicate token or mode is refused", () => {
    expect(
      refused([
        [
          "light",
          [
            ["a", "#000"],
            ["a", "#111"],
          ],
        ],
      ]),
    ).toContain("twice");
    expect(
      refused([
        ["light", []],
        ["light", []],
      ]),
    ).toContain("twice");
  });

  test("a refusal escapes invisible characters of the name it quotes", () => {
    const message = refused([
      ["a‮", []],
      ["a‮", []],
    ]);
    expect(message).toContain(String.raw`\u202e`);
    expect(message.includes("‮")).toBe(false);
  });

  test("a bad colour is refused with the format's message", () => {
    const next = setPalette(state, paletteEdits.setColour(entries, "light", "bg", "red"));
    expect(next.design).toBe(state.design);
    expect(next.issues[0]?.message).toContain("colour");
  });

  test("a malformed entry is refused", () => {
    refused([["light", [["a", 1]]]]);
    refused(["light"]);
  });

  test("removing a token a binding reads is an unknown reference", () => {
    const next = setPalette(state, paletteEdits.removeToken(entries, "ink"));
    expect(next.design).toBe(state.design);
    expect(next.issues.map((issue) => issue.message).join(" ")).toContain("ink");
  });

  test("a __proto__ token is an own key and the prototype stays clean", () => {
    const plain = setLayerProperty(state, "/canvas", "background", "#ffffff");
    const free = setLayerProperty(plain, "/layers/0/children/0", "fill", "#000000");
    const next = setPalette(free, [["light", [["__proto__", "#000000"]]]]);
    expect(next.issues).toEqual([]);
    const light = next.design.palette?.["light"] ?? {};
    expect(Object.hasOwn(light, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(light)).toBe(Object.prototype);
    expect(Object.keys(Object.prototype)).toEqual([]);
  });

  test("removing the last mode, or no entries, removes the palette", () => {
    const plain = setLayerProperty(state, "/canvas", "background", "#ffffff");
    const free = setLayerProperty(plain, "/layers/0/children/0", "fill", "#000000");
    const one = setPalette(free, [["light", []]]);
    expect(one.issues).toEqual([]);
    const none = setPalette(
      one,
      paletteEdits.removeMode(paletteEdits.paletteEntries(one.design.palette), "light"),
    );
    expect(none.issues).toEqual([]);
    expect(Object.hasOwn(none.design, "palette")).toBe(false);
    expect(Object.hasOwn(setPalette(one, undefined).design, "palette")).toBe(false);
  });
});
