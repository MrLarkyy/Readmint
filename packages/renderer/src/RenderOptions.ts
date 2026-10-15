import type { RenderLimits } from "./RenderLimits.js";

/**
 * Bytes of assets whose `src` is a path or (images) a `{{binding}}`, keyed by asset id. The renderer never reads files
 * or the network: the CLI, the Action and the editor resolve paths, fetch bound images and pass the bytes. An asset
 * given here wins over its `src`.
 */
export interface RenderAssets {
  readonly fonts?: Readonly<Record<string, Uint8Array>>;
  readonly images?: Readonly<Record<string, Uint8Array>>;
}

export interface RenderOptions {
  /** JSON data the expressions read (`@readmint/expr`): its own top-level keys are the root names. */
  readonly data?: Readonly<Record<string, unknown>>;
  /**
   * BCP 47 tag the `number`, `compact`, `percent` and `date` filters format for. Overrides the design `locale`;
   * default the design `locale`, else `en`.
   */
  readonly locale?: string;
  readonly assets?: RenderAssets;
  readonly limits?: Partial<RenderLimits>;
  /**
   * Milliseconds on the design's timeline: renders that frame as a static SVG (no CSS animation), for raster export.
   * A looping timeline starts over at its duration, one that does not loop holds its end. Finite, in 0..86400000;
   * a design without `animation` ignores it.
   */
  readonly time?: number;
}
