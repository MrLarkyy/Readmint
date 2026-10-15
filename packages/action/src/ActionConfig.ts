import type { OutputFormat } from "@readmint/cli";

/** The inputs of one run, read and checked by `readInputs`. */
export interface ActionConfig {
  /** Design files as listed, relative to the workspace; 1 to `maxDesigns`. */
  readonly designs: readonly string[];
  /** Output folder relative to the workspace, `/`-separated, never escaping it. */
  readonly outputDir: string;
  /** Each listed once, in the listed order; the first is the one the README snippet shows. */
  readonly formats: readonly OutputFormat[];
  /** Raster pixels per design pixel, 1..4. */
  readonly scale: number;
  /** Frames per second of an animated raster output; absent: 30, GIF 25. */
  readonly frameRate?: number;
  /** Lossy WebP quality, 1..100, for the webp outputs; absent: lossless. */
  readonly quality?: number;
  /** GitHub data token; empty when `dataFile` is given. Never printed. */
  readonly token: string;
  /** GitHub login to load; empty: the token's owner. */
  readonly login: string;
  /** Fixture data file instead of a GitHub load. */
  readonly dataFile?: string;
  /** Locale override for the expression filters; absent: the design's `locale`, else `en`. */
  readonly locale?: string;
  readonly commitMessage: string;
  /** Branch to push to; absent: the checked-out branch. */
  readonly branch?: string;
  readonly dryRun: boolean;
}
