import type { ShapingState } from "./Shaper.js";

/** How a feature applies: to every glyph (global) or only where a shaper sets its mask. */
export interface FeatureOptions {
  readonly global?: boolean;
  /** ZWJ is matched like any glyph in this feature's input, never stepped over. */
  readonly manualZwj?: boolean;
  /** ZWNJ is matched like any glyph in this feature's context, never stepped over. */
  readonly manualZwnj?: boolean;
  /** A match stays inside one syllable (Indic). */
  readonly perSyllable?: boolean;
}

export interface PlannedFeature {
  readonly tag: string;
  readonly stage: number;
  readonly global: boolean;
  readonly manualZwj: boolean;
  readonly manualZwnj: boolean;
  readonly perSyllable: boolean;
}

/** Work a shaper does between GSUB stages (Indic reordering). */
export type PauseHook = (state: ShapingState) => void;

/**
 * Collects the features of a plan in stages (HarfBuzz hb_ot_map_builder_t): lookups of one stage are applied
 * together in lookup order; a pause ends a stage and may run a hook. A feature added twice keeps its first stage.
 */
export class PlanBuilder {
  readonly features: PlannedFeature[] = [];
  /** The hook run after each stage. */
  readonly pauses: (PauseHook | undefined)[] = [];
  private stage = 0;

  constructor(private readonly disabled: ReadonlySet<string>) {}

  get stageCount(): number {
    return this.stage + 1;
  }

  add(tag: string, options: FeatureOptions = {}): void {
    if (this.disabled.has(tag) || this.features.some((feature) => feature.tag === tag)) return;
    this.features.push({
      tag,
      stage: this.stage,
      global: options.global ?? true,
      manualZwj: options.manualZwj ?? false,
      manualZwnj: options.manualZwnj ?? false,
      perSyllable: options.perSyllable ?? false,
    });
  }

  pause(hook?: PauseHook): void {
    this.pauses[this.stage] = hook;
    this.stage++;
  }
}
