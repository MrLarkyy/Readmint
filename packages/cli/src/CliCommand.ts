import type { OutputFormat } from "./OutputFormat.js";

/** Arguments every design command takes. */
export interface DesignArgs {
  /** The design file as given; resolved against the working folder, must lie inside `root`. */
  readonly design: string;
  /** Folder the design file must lie in; default the working folder. */
  readonly root?: string;
  /** Fixture data file (`--data`). */
  readonly data?: string;
  readonly locale?: string;
  /** `--fetch-images`: fetch the images whose `src` is bound to data; without it the CLI never fetches. */
  readonly fetchImages?: boolean;
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
  | (DesignArgs & { readonly name: "preview"; readonly port: number });
