import type { RenderLimits } from "./RenderLimits.js";

/**
 * Bytes of assets whose `src` is a path, keyed by asset id. The renderer never reads files: the CLI, the Action
 * and the editor resolve paths and pass the bytes. An asset given here wins over its `src`.
 */
export interface RenderAssets {
  readonly fonts?: Readonly<Record<string, Uint8Array>>;
  readonly images?: Readonly<Record<string, Uint8Array>>;
}

export interface RenderOptions {
  /** JSON data the expressions read (`@readmint/expr`): its own top-level keys are the root names. */
  readonly data?: Readonly<Record<string, unknown>>;
  /** BCP 47 tag the `number`, `compact`, `percent` and `date` filters format for; default `en`. */
  readonly locale?: string;
  readonly assets?: RenderAssets;
  readonly limits?: Partial<RenderLimits>;
}
