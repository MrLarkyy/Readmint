import { describe, expect, test } from "vitest";
import { paletteEdits } from "../src/index.js";

const {
  addMode,
  addToken,
  paletteEntries,
  removeMode,
  removeToken,
  renameMode,
  renameToken,
  setColour,
} = paletteEdits;

const start = paletteEntries({
  light: { bg: "#ffffff", ink: "#111111" },
  dark: { bg: "#000000", ink: "#eeeeee" },
});

function sameTokens(entries: paletteEdits.PaletteEntries): void {
  const [first, ...rest] = entries;
  for (const entry of rest) {
    expect(entry[1].map(([name]) => name)).toEqual(first?.[1].map(([name]) => name));
  }
}

describe("palette operations", () => {
  test("addMode copies the first mode under a fresh name", () => {
    const next = addMode(start);
    expect(next.map(([mode]) => mode)).toEqual(["light", "dark", "mode1"]);
    expect(next[2]?.[1]).toEqual(start[0]?.[1]);
    expect(addMode(next).map(([mode]) => mode)).toContain("mode2");
    sameTokens(next);
  });

  test("addToken adds a black token to every mode", () => {
    const next = addToken(start);
    for (const [, tokens] of next) expect(tokens.at(-1)).toEqual(["token1", "#000000"]);
    sameTokens(next);
    sameTokens(addToken(next));
  });

  test("rename, remove and colour keep every mode with the same tokens in order", () => {
    sameTokens(renameToken(start, "bg", "paper"));
    expect(renameToken(start, "bg", "paper")[1]?.[1][0]).toEqual(["paper", "#000000"]);
    expect(removeToken(start, "bg")[1]?.[1]).toEqual([["ink", "#eeeeee"]]);
    expect(renameMode(start, "dark", "night").map(([mode]) => mode)).toEqual(["light", "night"]);
    expect(removeMode(start, "light").map(([mode]) => mode)).toEqual(["dark"]);
    expect(removeMode(removeMode(start, "light"), "dark")).toEqual([]);
    const coloured = setColour(start, "dark", "ink", "#123456");
    expect(coloured[1]?.[1][1]).toEqual(["ink", "#123456"]);
    expect(coloured[0]).toBe(start[0]);
    sameTokens(coloured);
  });

  test("a palette without modes has no entries; addToken leaves it", () => {
    expect(paletteEntries(undefined)).toEqual([]);
    expect(addToken([])).toEqual([]);
    expect(addMode([])).toEqual([["mode1", []]]);
  });
});
