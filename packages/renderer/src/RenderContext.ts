import type { Design } from "@readmint/format";
import type { ExprResult, Template } from "@readmint/expr";
import { AnimationCss } from "./animationCss.js";
import type { LoadedFont } from "./loadFont.js";
import type { LoadedImage } from "./loadImage.js";
import type { Bounds } from "./pathBounds.js";
import { RenderFailure } from "./RenderFailure.js";
import type { RenderIssue, RenderIssueCode } from "./RenderIssue.js";
import { RenderLimits } from "./RenderLimits.js";
import type { RenderAssets, RenderOptions } from "./RenderOptions.js";
import { SvgWriter } from "./SvgWriter.js";

/** Everything one render owns. Created per call, so nothing survives into the next render. */
export class RenderContext {
  readonly limits: RenderLimits;
  readonly assets: RenderAssets;
  readonly writer: SvgWriter;
  readonly warnings: RenderIssue[] = [];
  /** Loaded fonts by asset id, in first-use order. */
  readonly fonts = new Map<string, LoadedFont>();
  /** Loaded images by asset id, in first-use order. */
  readonly images = new Map<string, LoadedImage>();
  /** Compiled expressions by source text; a design string is compiled once per render. */
  readonly templates = new Map<string, ExprResult<Template>>();
  /** Bytes each image adds to the output, every use counted. */
  readonly imageBytes = new Map<string, number>();
  /** Bounds of path data by layer pointer: `d` is never bound, so every repeat copy of a layer shares them. */
  readonly pathBounds = new Map<string, Bounds | undefined>();
  /** Lengths of path data drawn on by a `draw` track, by layer pointer, like `pathBounds`. */
  readonly pathLengths = new Map<string, number>();
  /** Track pointers that already warned `animation-cut`: one warning per track, however many copies. */
  readonly cutTracks = new Set<string>();
  /** The milliseconds of the frame to draw; undefined draws the animated SVG (static attributes at frame 0). */
  readonly time: number | undefined;
  readonly animationCss: AnimationCss;
  private readonly trail: string[] = [];
  private depth = 0;
  private repeatCopies = 0;

  constructor(
    readonly design: Design,
    options: RenderOptions,
  ) {
    this.limits = mergeLimits(options.limits);
    this.assets = options.assets ?? {};
    this.writer = new SvgWriter(this.limits.maxOutputBytes);
    this.time = options.time;
    this.animationCss = new AnimationCss(this.writer);
  }

  /** Stops the render with an issue; the message names the component instances and repeat items around it. */
  fail(path: string, code: RenderIssueCode, message: string): never {
    const where = this.trail.length === 0 ? "" : ` (${this.trail.join(", ")})`;
    throw new RenderFailure(path, code, `${message}${where}`);
  }

  warn(path: string, code: RenderIssueCode, message: string): void {
    this.warnings.push({ path, code, message });
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
