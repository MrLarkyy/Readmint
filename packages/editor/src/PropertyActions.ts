import type { LetEntries } from "./setLayerLet.js";
import type { PaletteEntries } from "./paletteEdits.js";

/** What the property panel asks the editor to do. */
export interface PropertyActions {
  set(pointer: string, key: string, value: unknown): void;
  invalid(message: string, path: string): void;
  /** Replaces the `let` of the layer at `pointer`. */
  setLet(pointer: string, entries: LetEntries): void;
  /** Replaces the design's palette; no entries remove it. */
  setPalette(entries: PaletteEntries | undefined): void;
}
