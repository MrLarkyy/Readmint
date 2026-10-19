import type { RenderVariant } from "@readmint/format";
import type { OutputFormat } from "./OutputFormat.js";
import type { DataFeedSpec } from "./parseDataFeedArgs.js";
import type { DataJsonSpec } from "./parseDataJsonArgs.js";
import type { DataRegistrySpec } from "./parseDataRegistryArgs.js";
import type { DataWakaTimeSpec } from "./parseDataWakaTimeArgs.js";

/** Arguments every design command takes. */
export interface DesignArgs {
  /** The design file as given; resolved against the working folder, must lie inside `root`. */
  readonly design: string;
  /** Folder the design file must lie in; default the working folder. */
  readonly root?: string;
  /** Fixture data file (`--data`). */
  readonly data?: string;
  /** Settings file (`--props`): root component props by section, merged into the design. */
  readonly props?: string;
  readonly locale?: string;
  /** `--fetch-images`: fetch the images whose `src` is bound to data; without it the CLI never fetches. */
  readonly fetchImages?: boolean;
  /** `--github`: load `{ github }` live with the token from the environment instead of `--data`. */
  readonly github?: boolean;
  /** `--login`: the GitHub login `--github` loads; the token's owner when absent. */
  readonly login?: string;
  /** `--exclude-repositories`: repository names `--github` leaves out of every aggregate. */
  readonly excludeRepositories?: readonly string[];
  /** `--language-commit-cap`: own commits `--github` reads for `github.languagesAuthored`, 0 to 2000. */
  readonly languageCommitCap?: number;
  /** `--cache-dir`: folder where `--github`, `--data-wakatime` and `--data-registry` keep their answers between runs, relative to the current folder. */
  readonly cacheDir?: string;
  /**
   * `--data-json` with its `--data-json-header` headers: JSON documents loaded live, each under its namespace, added
   * to `--data` or `--github` data.
   */
  readonly dataJson?: readonly DataJsonSpec[];
  /**
   * `--data-feed` with its `--data-feed-limit` limits: RSS or Atom feeds loaded live, each under its namespace, added
   * after the JSON documents to `--data` or `--github` data.
   */
  readonly dataFeed?: readonly DataFeedSpec[];
  /**
   * `--data-wakatime` with its `--data-wakatime-range` ranges: WakaTime coding stats loaded live with the API key of
   * the named environment variable, each under its namespace, added after the feeds to `--data` or `--github` data.
   */
  readonly dataWakaTime?: readonly DataWakaTimeSpec[];
  /**
   * `--data-registry`: the latest versions of npm packages and Maven Central artifacts loaded live (no key), each
   * namespace's entries under it, added after the WakaTime stats to `--data` or `--github` data.
   */
  readonly dataRegistry?: readonly DataRegistrySpec[];
}

/** `readmint render` beyond the design arguments. */
export interface RenderArgs {
  readonly time?: number;
  readonly out?: string;
  /** `--format`, else from the `--out` extension (`.png`, `.apng`, `.webp`, `.gif`), else `svg`. */
  readonly format: OutputFormat;
  /** Raster pixels per SVG pixel (`--scale`); raster formats only. */
  readonly scale?: number;
  /** Frames per second of an animation (`--frame-rate`); raster formats only. */
  readonly frameRate?: number;
  /** Lossy WebP quality, 1..100 (`--quality`); webp only. */
  readonly quality?: number;
  /** Render this named variant of the design (`--variant`): its props are set before the settings file's. */
  readonly variant?: RenderVariant;
}

/**
 * `readmint render --manifest <file> --out-dir <dir>`: the designs and their props come from the manifest, so there is
 * no design file, `--root` or `--out`.
 */
export type ManifestRenderArgs = Omit<DesignArgs, "design" | "root"> &
  Omit<RenderArgs, "out"> & {
    readonly name: "render";
    /** The manifest file as given; resolved against the working folder. */
    readonly manifest: string;
    /** Folder every render is written to (`<name>[.dark].<ext>`); created when missing. */
    readonly outDir: string;
  };

/** A parsed command line. */
export type CliCommand =
  | { readonly name: "help" }
  | { readonly name: "version" }
  | (DesignArgs & RenderArgs & { readonly name: "render" })
  | ManifestRenderArgs
  | (DesignArgs & { readonly name: "validate"; readonly time?: number })
  | (DesignArgs & { readonly name: "preview"; readonly port: number; readonly open?: boolean });
