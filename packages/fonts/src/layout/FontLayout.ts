import { readKerning, type KerningLookup } from "../readKerning.js";
import type { SfntFont } from "../SfntFont.js";
import { SfntReader } from "../SfntReader.js";
import { arabicShaper } from "../shaping/arabicShaper.js";
import { defaultShaper } from "../shaping/defaultShaper.js";
import { devanagariShaper } from "../shaping/devanagariShaper.js";
import { PlanBuilder } from "../shaping/PlanBuilder.js";
import { ShapePlan } from "../shaping/ShapePlan.js";
import type { Shaper } from "../shaping/Shaper.js";
import type { ScriptCode } from "../unicode/scriptOf.js";
import { Gdef } from "./Gdef.js";
import { LayoutTable } from "./LayoutTable.js";

/** OpenType script tags of the scripts the default shaper handles with a tag of their own. */
const scriptTags: Readonly<Partial<Record<ScriptCode, readonly string[]>>> = {
  Latn: ["latn"],
  Grek: ["grek"],
  Cyrl: ["cyrl"],
  Armn: ["armn"],
  Hebr: ["hebr"],
  Geor: ["geor"],
  Thai: ["thai"],
  Hani: ["hani"],
  Kana: ["kana"],
  Hang: ["hang"],
};

/** Features on by default (HarfBuzz's common and horizontal features); dlig and stylistic sets stay off. */
const commonFeatures = ["abvm", "blwm", "ccmp", "locl", "mark", "mkmk", "rlig"];
const horizontalFeatures = ["calt", "clig", "curs", "dist", "kern", "liga", "rclt"];

const layouts = new WeakMap<SfntFont, FontLayout>();

/** What a plan is built for. */
export interface PlanKey {
  readonly script: ScriptCode;
  readonly rtl: boolean;
  readonly kerning: boolean;
  readonly ligatures: boolean;
}

/**
 * A font's layout tables (GDEF, GSUB, GPOS, the legacy kern table), read on its first shaping call and kept with the
 * font, with the shaping plans built for it. A broken table throws `MalformedFont` from that call.
 */
export class FontLayout {
  readonly gdef: Gdef;
  readonly gsub: LayoutTable | undefined;
  readonly gpos: LayoutTable | undefined;
  private readonly plans = new Map<string, ShapePlan>();
  private kernTable: KerningLookup | null | undefined;

  private constructor(readonly font: SfntFont) {
    this.gdef = Gdef.read(readerOf(font, "GDEF"));
    const gsub = readerOf(font, "GSUB");
    const gpos = readerOf(font, "GPOS");
    this.gsub = gsub === undefined ? undefined : new LayoutTable(gsub, "GSUB");
    this.gpos = gpos === undefined ? undefined : new LayoutTable(gpos, "GPOS");
  }

  static of(font: SfntFont): FontLayout {
    let layout = layouts.get(font);
    if (layout === undefined) {
      layout = new FontLayout(font);
      layouts.set(font, layout);
    }
    return layout;
  }

  /** The legacy `kern` table's pairs, undefined when the font has none. */
  get legacyKerning(): KerningLookup | undefined {
    if (this.kernTable === undefined)
      this.kernTable = readKerning(readerOf(this.font, "kern")) ?? null;
    return this.kernTable ?? undefined;
  }

  plan(key: PlanKey): ShapePlan {
    const id = `${key.script}|${String(key.rtl)}|${String(key.kerning)}|${String(key.ligatures)}`;
    let plan = this.plans.get(id);
    if (plan === undefined) {
      plan = this.buildPlan(key);
      this.plans.set(id, plan);
    }
    return plan;
  }

  private buildPlan(key: PlanKey): ShapePlan {
    const shaper = shaperFor(key.script);
    const disabled = new Set<string>();
    if (!key.kerning) disabled.add("kern");
    if (!key.ligatures) for (const tag of ["liga", "clig", "calt"]) disabled.add(tag);
    const builder = new PlanBuilder(disabled);
    builder.add("rvrn");
    builder.pause();
    if (key.rtl) {
      builder.add("rtla");
      builder.add("rtlm", { global: false });
    } else {
      builder.add("ltra");
      builder.add("ltrm");
    }
    shaper.collectFeatures(builder);
    for (const tag of [...commonFeatures, ...horizontalFeatures]) builder.add(tag);
    return new ShapePlan(shaper, builder, this.gsub, this.gpos);
  }
}

function readerOf(font: SfntFont, tag: string): SfntReader | undefined {
  const bytes = font.table(tag);
  return bytes === undefined || bytes.length === 0 ? undefined : new SfntReader(bytes);
}

function shaperFor(script: ScriptCode): Shaper {
  if (script === "Arab") return arabicShaper;
  if (script === "Deva") return devanagariShaper;
  return defaultShaper(scriptTags[script] ?? []);
}
