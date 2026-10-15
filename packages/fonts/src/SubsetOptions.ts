import type { OutlineBudget } from "./OutlineBudget.js";

export interface SubsetOptions {
  /** Shared outline work of the font (CFF subsets are flattened through it). */
  readonly budget?: OutlineBudget;
  /** Most bytes the uncompressed subset may reach; checked glyph by glyph while it is built (`too-large`). */
  readonly maxBytes?: number;
}
