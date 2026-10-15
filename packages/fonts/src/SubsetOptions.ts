import type { OutlineBudget } from "./OutlineBudget.js";

export interface SubsetOptions {
  /** Outline work shared with everything else the caller reads outlines for (CFF subsets are flattened through it). */
  readonly budget?: OutlineBudget;
  /** Most bytes the uncompressed subset may reach; checked glyph by glyph while it is built (`too-large`). */
  readonly maxBytes?: number;
}
