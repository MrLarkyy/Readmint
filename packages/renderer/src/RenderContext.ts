import type { Design } from "@readmint/format";
import type { ExprResult, Scope, Template } from "@readmint/expr";
import { OutlineBudget, type GlyphOutline, type SfntFont } from "@readmint/fonts";
import { AnimationCss } from "./AnimationCss.js";
import { EntropyBudget } from "./EntropyBudget.js";
import { CanvasPlacement } from "./CanvasPlacement.js";
import type { FontUse } from "./FontUse.js";
import type { LoadedFont } from "./loadFont.js";
import type { LoadedImage } from "./loadImage.js";
import { MissingGlyphs } from "./MissingGlyphs.js";
import type { TextLayout } from "./TextLayout.js";
import type { Bounds } from "./pathBounds.js";
import { RenderFailure } from "./RenderFailure.js";
import type { RenderIssue, RenderIssueCode } from "./RenderIssue.js";
import { RenderLimits } from "./RenderLimits.js";
import type { RenderNode } from "./RenderNode.js";
import type { RenderAssets, RenderOptions } from "./RenderOptions.js";
import { SvgWriter } from "./SvgWriter.js";

/**
 * Shaping work of one render, every text together (the operations their shaping budgets spent): some 250 texts at
 * the floor one text gets, far more than any real README graphic needs, and well under a second. Like the outline
 * work, a fixed internal bound, not a `RenderLimits` field.
 */
export const maxRenderShapingOperations = 4_000_000;

/** Everything one render owns. Created per call, so nothing survives into the next render. */
export class RenderContext {
  readonly limits: RenderLimits;
  readonly assets: RenderAssets;
  readonly writer: SvgWriter;
  readonly warnings: RenderIssue[] = [];
  /** Loaded fonts by asset id, in first-use order. */
  readonly fonts = new Map<string, LoadedFont>();
  /** Glyphs drawn per font asset, in the order fonts first draw a glyph. */
  readonly fontUse = new Map<string, FontUse>();
  /** Glyph outlines by asset id and glyph, read once per render for text drawn as paths. */
  readonly outlines = new Map<string, GlyphOutline>();
  /**
   * Outline work of the whole render, every font together: paths (each glyph once, then cached) and CFF subsets.
   * Per font it would grow with the number of font assets.
   */
  readonly outlineBudget = new OutlineBudget();
  /** Shaping operations spent by the texts of the render so far (`chargeShaping`). */
  shapingOperations = 0;
  /** JPEG symbol-check steps the images of the render may still take, every image together. */
  readonly entropyBudget = new EntropyBudget();
  /**
   * Parsed fonts by source: the bytes a caller supplied (by identity) or the `src` data URI (by value), so assets
   * sharing one source decode it once and count it once against `maxTotalFontBytes`.
   */
  readonly parsedFonts = new Map<
    Uint8Array | string,
    { font: SfntFont; mime: string | undefined }
  >();
  /**
   * Parsed fonts of supplied bytes by content (`bytesKey`, confirmed byte for byte), so equal bytes in different
   * arrays (any caller: the CLI, the editor, an API user) are decoded and charged once too. One entry per key.
   */
  readonly fontsByContent = new Map<
    string,
    { bytes: Uint8Array; read: { font: SfntFont; mime: string | undefined } }
  >();
  /** Decoded font bytes the render may still take (`maxTotalFontBytes`). */
  fontBytesLeft: number;
  /**
   * Uncompressed bytes the font subsets of the render may still take: four times the output budget, for all subsets
   * together (each one is also held to four times what is left of the output).
   */
  subsetBytesLeft: number;
  readonly missingGlyphs = new MissingGlyphs();
  /**
   * Laid-out texts by everything their layout depends on, so repeat copies of one text are laid out (and their glyphs
   * recorded) once; one entry per distinct text, whose content each copy has reserved in the output budget.
   */
  readonly textLayouts = new Map<string, TextLayout>();
  /** Results of `textWidth` and `truncateWidth` by filter, font, size, letter spacing (width) and text. */
  readonly textWidths = new Map<string, number | string>();
  /** Pointer of the expression being evaluated: where measuring its text fails, for instance on the shaping bound. */
  expressionPath = "";
  /** Loaded images by asset id, in first-use order. */
  readonly images = new Map<string, LoadedImage>();
  /** Compiled expressions by source text; a design string is compiled once per render. */
  readonly templates = new Map<string, ExprResult<Template>>();
  /** Bytes each image asset adds to the output: its data URI where it is written, which is once per distinct data. */
  readonly imageBytes = new Map<string, number>();
  /** Distinct image data URIs by length and hash, so assets with identical bytes share one string and one key. */
  readonly imageData = new Map<string, string[]>();
  /** Image nodes per `dataKey`, counted before drawing: data used more than once is defined once and referenced. */
  readonly imageUses = new Map<string, number>();
  /**
   * `dataKey` -> id of its shared `<image>` definition, looked up before `SvgWriter.share` so megabytes of image
   * markup are built and hashed once per distinct data, not once per use.
   */
  readonly sharedImages = new Map<string, string>();
  /**
   * Bounds of path data by `pathDataKey`: the layer pointer for a literal `d`, which every repeat copy of the layer
   * shares, the resolved data for a template `d`, so each copy gets the bounds of its own data.
   */
  readonly pathBounds = new Map<string, Bounds | undefined>();
  /** Lengths of path data drawn on by a `draw` track, by `pathDataKey`, like `pathBounds`. */
  readonly pathLengths = new Map<string, number>();
  /** Track pointers that already warned `animation-cut`: one warning per track, however many copies. */
  readonly cutTracks = new Set<string>();
  /** The milliseconds of the frame to draw; undefined draws the animated SVG (static attributes at frame 0). */
  readonly time: number | undefined;
  /** The transforms of the groups around the node being drawn, and the canvas `renderSvg` sets. */
  readonly placement = new CanvasPlacement();
  /** `inkBounds` of the nodes measured so far; a node's bounds do not change within one render. */
  readonly inkBounds = new WeakMap<RenderNode, Bounds | undefined>();
  readonly animationCss: AnimationCss;
  /**
   * The props of the root instance at `path` (`/layers/<i>`), when the canvas needed them, and the scope of its `let`
   * when it has one: its expansion reuses both, so their bindings are evaluated (and charged to the budget) once.
   */
  rootProps:
    | {
        readonly path: string;
        readonly props: Readonly<Record<string, unknown>>;
        readonly scope?: Scope;
      }
    | undefined;
  /** The render data: a `let` name may not hide one of its own top-level keys. */
  readonly data: Readonly<Record<string, unknown>>;
  /** `let` objects whose names were checked (reads of later entries, data keys), each once per render. */
  readonly checkedLets = new WeakSet<object>();
  private readonly trail: string[] = [];
  private depth = 0;
  private repeatCopies = 0;
  private animationKeyframes = 0;

  constructor(
    readonly design: Design,
    options: RenderOptions,
  ) {
    this.limits = mergeLimits(options.limits);
    this.assets = options.assets ?? {};
    this.writer = new SvgWriter(this.limits.maxOutputBytes);
    this.fontBytesLeft = this.limits.maxTotalFontBytes;
    this.subsetBytesLeft = this.limits.maxOutputBytes * 4;
    this.time = options.time;
    this.data = options.data ?? {};
    this.animationCss = new AnimationCss(this.writer);
  }

  /** Stops the render with an issue; the message names the component instances and repeat items around it. */
  fail(path: string, code: RenderIssueCode, message: string): never {
    const where = this.trail.length === 0 ? "" : ` (${this.trail.join(", ")})`;
    throw new RenderFailure(path, code, `${message}${where}`);
  }

  /**
   * Charges shaping work of the text at `path` against the render's bound: past `maxRenderShapingOperations`, every
   * text together, the render fails with `asset-too-large` at the text that crossed it, in the same order every run.
   */
  chargeShaping(operations: number, path: string, font: string): void {
    this.shapingOperations += operations;
    if (this.shapingOperations > maxRenderShapingOperations) {
      this.fail(
        path,
        "asset-too-large",
        `shaping this text with ${font} brings the render past ${String(maxRenderShapingOperations)} shaping operations (all texts together)`,
      );
    }
  }

  warn(path: string, code: RenderIssueCode, message: string): void {
    this.warnings.push({ path, code, message });
  }

  /** The record of what this render draws with `font`, created at its first glyph. */
  useFont(font: LoadedFont): FontUse {
    let use = this.fontUse.get(font.asset);
    if (use === undefined) {
      use = {
        font,
        embedded: new Map(),
        glyphs: new Set(),
        privateCodes: new Map(),
        embeddedBytes: 0,
        pathBytes: 0,
      };
      this.fontUse.set(font.asset, use);
    }
    return use;
  }

  /** Charges the copies of one repeat against `maxRepeatCopies`, before any of them is expanded. */
  countRepeatCopies(path: string, count: number): void {
    this.repeatCopies += count;
    const max = this.limits.maxRepeatCopies;
    if (this.repeatCopies > max) {
      this.fail(
        path,
        "too-large",
        `this repeat brings the render to ${String(this.repeatCopies)} copies; at most ${String(max)} are allowed (copies an if or visible drops count too)`,
      );
    }
  }

  /** Charges the keyframes of one track against `maxAnimationKeyframes`, before any of them is resolved. */
  countAnimationKeyframes(path: string, count: number): void {
    this.animationKeyframes += count;
    const max = this.limits.maxAnimationKeyframes;
    if (this.animationKeyframes > max) {
      this.fail(
        path,
        "too-large",
        `this track brings the render to ${String(this.animationKeyframes)} animation keyframes; at most ${String(max)} are allowed (every repeat copy counts)`,
      );
    }
  }

  /** Component instances currently being expanded around the layer at hand. */
  get componentDepth(): number {
    return this.depth;
  }

  /** Runs `body` one component level deeper. */
  nested<T>(body: () => T): T {
    this.depth++;
    try {
      return body();
    } finally {
      this.depth--;
    }
  }

  /** Runs `body` with `note` added to the location of every issue raised inside it. */
  within<T>(note: string, body: () => T): T {
    this.trail.push(note);
    try {
      return body();
    } finally {
      this.trail.pop();
    }
  }
}

/** The defaults with every override that is a finite, non-negative number. */
function mergeLimits(overrides: Partial<RenderLimits> | undefined): RenderLimits {
  const limits = { ...RenderLimits };
  for (const key of Object.keys(RenderLimits) as (keyof RenderLimits)[]) {
    const value: unknown = overrides?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      (limits as Record<keyof RenderLimits, number>)[key] = value;
    }
  }
  return Object.freeze(limits);
}
