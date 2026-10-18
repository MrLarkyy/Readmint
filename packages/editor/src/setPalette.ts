import { DesignLimits } from "@readmint/format";
import { commitDesign, refuse } from "./commitDesign.js";
import { getAt, setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import type { PaletteEntries } from "./paletteEdits.js";
import { sameJson } from "./sameJson.js";

const path = "/palette";
/** Characters of an input value a refusal may echo. */
const shown = 64;

function echo(value: string): string {
  return JSON.stringify(value.length > shown ? `${value.slice(0, shown)}...` : value);
}

function isPair(item: unknown): item is readonly [string, unknown] {
  return Array.isArray(item) && item.length === 2 && typeof item[0] === "string";
}

/**
 * Replaces the design's palette with `entries` (no entries, or `undefined`, removes it). The mode and token counts are
 * checked against the format's limits before the object is built; the format's validation checks names, colours and
 * that every mode holds the same tokens, and what reads a token that is gone. Refused, the state is unchanged.
 */
export function setPalette(state: EditorState, entries: PaletteEntries | undefined): EditorState {
  if (entries === undefined || (Array.isArray(entries) && entries.length === 0)) {
    return commitDesign(state, setAt(state.design, path, undefined));
  }
  if (!Array.isArray(entries))
    return refuse(state, "design", "the palette must be a list of modes", path);
  if (entries.length > DesignLimits.maxPaletteModes) {
    return refuse(
      state,
      "design",
      `a palette may have at most ${String(DesignLimits.maxPaletteModes)} modes`,
      path,
    );
  }
  const modes = new Set<string>();
  for (const entry of entries as readonly unknown[]) {
    if (!isPair(entry) || !Array.isArray(entry[1])) {
      return refuse(
        state,
        "design",
        "every palette mode must be a name and a list of tokens",
        path,
      );
    }
    const [mode, tokens] = entry as [string, readonly unknown[]];
    if (modes.has(mode)) {
      return refuse(state, "design", `the palette mode ${echo(mode)} is used twice`, path);
    }
    modes.add(mode);
    if (tokens.length > DesignLimits.maxPaletteTokens) {
      return refuse(
        state,
        "design",
        `a palette mode may have at most ${String(DesignLimits.maxPaletteTokens)} tokens`,
        path,
      );
    }
    const names = new Set<string>();
    for (const token of tokens) {
      if (!isPair(token) || typeof token[1] !== "string") {
        return refuse(state, "design", "every palette token must be a name and a colour", path);
      }
      if (names.has(token[0])) {
        return refuse(
          state,
          "design",
          `the token ${echo(token[0])} is used twice in mode ${echo(mode)}`,
          path,
        );
      }
      names.add(token[0]);
    }
  }
  const value = Object.fromEntries(
    (entries as readonly (readonly [string, readonly (readonly [string, string])[]])[]).map(
      ([mode, tokens]) => [mode, Object.fromEntries(tokens)],
    ),
  );
  if (sameJson(value, getAt(state.design, path))) return commitDesign(state, state.design);
  return commitDesign(state, setAt(state.design, path, value));
}
