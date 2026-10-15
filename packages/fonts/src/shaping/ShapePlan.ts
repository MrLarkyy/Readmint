import { MalformedFont } from "../MalformedFont.js";
import type { LookupOptions } from "../layout/ApplyContext.js";
import type { FeatureLookups, LayoutTable } from "../layout/LayoutTable.js";
import type { PauseHook, PlanBuilder, PlannedFeature } from "./PlanBuilder.js";
import type { Shaper } from "./Shaper.js";

export interface PlanLookup extends LookupOptions {
  readonly index: number;
}

export interface PlanStage {
  readonly lookups: readonly PlanLookup[];
  readonly pause: PauseHook | undefined;
}

/** Feature bits available besides the global one. */
const maxMaskBits = 30;

/**
 * The lookups a font applies for one script, direction and option set, in stages, with the mask bit of every
 * feature a shaper sets per glyph (HarfBuzz hb_ot_map_t). Built once per font and options, then reused.
 */
export class ShapePlan {
  readonly globalMask = 1;
  readonly gsub: readonly PlanStage[];
  readonly gpos: readonly PlanStage[];
  /** The script tag the GSUB table was read under, undefined when it has none of the shaper's. */
  readonly gsubScript: string | undefined;
  /** Whether GPOS has kern lookups (else the legacy kern table kerns). */
  readonly gposKerns: boolean;
  /** Answers of `wouldSubstitute` (feature and glyphs as key), kept with the plan so each is computed once per font. */
  readonly substitutions = new Map<string, boolean>();
  private readonly masks = new Map<string, number>();
  private readonly gsubFeatures: ReadonlyMap<string, readonly number[]>;

  constructor(
    readonly shaper: Shaper,
    builder: PlanBuilder,
    gsub: LayoutTable | undefined,
    gpos: LayoutTable | undefined,
  ) {
    const tags = builder.features.map((feature) => feature.tag);
    this.gsubFeatures =
      gsub?.selectFeatures(shaper.scriptTags, tags) ?? new Map<string, readonly number[]>();
    const gposFeatures: FeatureLookups =
      gpos?.selectFeatures(shaper.scriptTags, tags) ?? new Map<string, readonly number[]>();
    this.gsubScript = shaper.scriptTags.find((tag) => gsub?.hasScript(tag) === true);
    this.gposKerns = (gposFeatures.get("kern")?.length ?? 0) > 0;
    let bit = 1;
    for (const feature of builder.features) {
      const used =
        (this.gsubFeatures.get(feature.tag)?.length ?? 0) > 0 ||
        (gposFeatures.get(feature.tag)?.length ?? 0) > 0;
      if (!used) continue;
      if (feature.global) {
        this.masks.set(feature.tag, this.globalMask);
        continue;
      }
      if (bit > maxMaskBits) throw new MalformedFont("shaping plan has too many features");
      this.masks.set(feature.tag, 1 << bit);
      bit++;
    }
    this.gsub = Array.from({ length: builder.stageCount }, (_, stage) => ({
      lookups: this.stageLookups(
        builder.features.filter((feature) => feature.stage === stage),
        this.gsubFeatures,
        stage === 0,
      ),
      pause: builder.pauses[stage],
    }));
    this.gpos = [
      {
        lookups: this.stageLookups(builder.features, gposFeatures, true),
        pause: undefined,
      },
    ];
  }

  /** The mask bit of a feature; 0 when the font has no lookups for it. */
  mask(tag: string): number {
    return this.masks.get(tag) ?? 0;
  }

  /** The GSUB lookups of a feature, for `wouldSubstitute`. */
  gsubLookups(tag: string): readonly number[] {
    return this.gsubFeatures.get(tag) ?? [];
  }

  /** Lookups of the features of one stage, each once, in lookup order (masks and joiner rules merged). */
  private stageLookups(
    features: readonly PlannedFeature[],
    selected: ReadonlyMap<string, readonly number[]>,
    withRequired: boolean,
  ): PlanLookup[] {
    const lookups = new Map<number, PlanLookup>();
    const add = (index: number, options: LookupOptions) => {
      const known = lookups.get(index);
      lookups.set(
        index,
        known === undefined
          ? { index, ...options }
          : {
              index,
              mask: known.mask | options.mask,
              autoZwj: known.autoZwj && options.autoZwj,
              autoZwnj: known.autoZwnj && options.autoZwnj,
              perSyllable: known.perSyllable || options.perSyllable,
            },
      );
    };
    if (withRequired) {
      for (const index of selected.get("") ?? []) {
        add(index, { mask: this.globalMask, autoZwj: true, autoZwnj: true, perSyllable: false });
      }
    }
    for (const feature of features) {
      const mask = this.mask(feature.tag);
      if (mask === 0) continue;
      for (const index of selected.get(feature.tag) ?? []) {
        add(index, {
          mask,
          autoZwj: !feature.manualZwj,
          autoZwnj: !feature.manualZwnj,
          perSyllable: feature.perSyllable,
        });
      }
    }
    return [...lookups.values()].sort((left, right) => left.index - right.index);
  }
}
