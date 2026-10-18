import type { Palette } from "@readmint/format";

/** A palette token and its colour text. */
export type PaletteToken = readonly [name: string, colour: string];
/** A palette mode: its name and its tokens in order. */
export type PaletteMode = readonly [name: string, tokens: readonly PaletteToken[]];
/** The palette as the panel edits it: modes in order, each with the same tokens in the same order. */
export type PaletteEntries = readonly PaletteMode[];

/** The default colour of a new token. */
export const newTokenColour = "#000000";

/** The palette's modes and tokens in document order; empty without a palette. */
export function paletteEntries(palette: Palette | undefined): PaletteEntries {
  if (palette === undefined) return [];
  return Object.entries(palette).map(([mode, tokens]) => [mode, Object.entries(tokens)] as const);
}

/** `prefix` and the smallest number from 1 that no name in `taken` has. */
function freshName(prefix: string, taken: readonly string[]): string {
  for (let index = 1; ; index++) {
    const name = `${prefix}${String(index)}`;
    if (!taken.includes(name)) return name;
  }
}

/** A new mode, a copy of the first (an empty one without modes), named `mode<n>`. */
export function addMode(entries: PaletteEntries): PaletteEntries {
  const first = entries[0];
  const name = freshName(
    "mode",
    entries.map(([mode]) => mode),
  );
  return [...entries, [name, first === undefined ? [] : first[1]]];
}

export function renameMode(entries: PaletteEntries, from: string, to: string): PaletteEntries {
  return entries.map((entry) => (entry[0] === from ? ([to, entry[1]] as const) : entry));
}

/** Without the mode; removing the last one leaves no entries, which removes the palette. */
export function removeMode(entries: PaletteEntries, mode: string): PaletteEntries {
  return entries.filter(([name]) => name !== mode);
}

/** A token `token<n>` in every mode, black; unchanged without modes. */
export function addToken(entries: PaletteEntries): PaletteEntries {
  const taken = (entries[0]?.[1] ?? []).map(([name]) => name);
  const name = freshName("token", taken);
  return entries.map(([mode, tokens]) => [mode, [...tokens, [name, newTokenColour]]] as const);
}

export function renameToken(entries: PaletteEntries, from: string, to: string): PaletteEntries {
  return entries.map(
    ([mode, tokens]) =>
      [
        mode,
        tokens.map((token) => (token[0] === from ? ([to, token[1]] as const) : token)),
      ] as const,
  );
}

export function removeToken(entries: PaletteEntries, token: string): PaletteEntries {
  return entries.map(
    ([mode, tokens]) => [mode, tokens.filter(([name]) => name !== token)] as const,
  );
}

export function setColour(
  entries: PaletteEntries,
  mode: string,
  token: string,
  colour: string,
): PaletteEntries {
  return entries.map((entry) =>
    entry[0] !== mode
      ? entry
      : ([
          mode,
          entry[1].map((item) => (item[0] === token ? ([token, colour] as const) : item)),
        ] as const),
  );
}
