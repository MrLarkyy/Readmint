import type { OutputFormat } from "./OutputFormat.js";
import type { DataFeedSpec } from "./parseDataFeedArgs.js";
import type { DataJsonSpec } from "./parseDataJsonArgs.js";

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
}

/** A parsed command line. */
export type CliCommand =
  | { readonly name: "help" }
  | { readonly name: "version" }
  | (DesignArgs & RenderArgs & { readonly name: "render" })
  | (DesignArgs & { readonly name: "validate"; readonly time?: number })
  | (DesignArgs & { readonly name: "preview"; readonly port: number; readonly open?: boolean });
