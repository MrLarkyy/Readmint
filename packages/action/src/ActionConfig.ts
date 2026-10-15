/** The inputs of one run, read and checked by `readInputs`. */
export interface ActionConfig {
  /** Design files as listed, relative to the workspace; 1 to `maxDesigns`. */
  readonly designs: readonly string[];
  /** Output folder relative to the workspace, `/`-separated, never escaping it. */
  readonly outputDir: string;
  readonly formats: readonly "svg"[];
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
