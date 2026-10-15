import type { SfntFont } from "../SfntFont.js";
import type { FontLayout } from "../layout/FontLayout.js";
import type { GlyphBuffer } from "../layout/GlyphBuffer.js";
import type { PlanBuilder } from "./PlanBuilder.js";
import type { ShapePlan } from "./ShapePlan.js";

/** What a shaper's hooks work on during one shaping call. */
export interface ShapingState {
  readonly font: SfntFont;
  readonly layout: FontLayout;
  readonly plan: ShapePlan;
  readonly buffer: GlyphBuffer;
}

/** Script-specific shaping (HarfBuzz hb_ot_shaper_t): features, their stages, masks and reordering. */
export interface Shaper {
  /** OpenType script tags, preferred first (the table's DFLT, dflt and latn follow). */
  readonly scriptTags: readonly string[];
  /** When mark advances are zeroed: after GPOS for GDEF marks, or never. */
  readonly zeroMarks: "late" | "none";
  /** Adds the shaper's features and pauses, between the direction features and the common ones. */
  collectFeatures(builder: PlanBuilder): void;
  /** Sets categories and masks before the first GSUB stage. */
  setup(state: ShapingState): void;
}
