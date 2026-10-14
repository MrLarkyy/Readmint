import type { ExpressionEvaluator } from "./ExpressionEvaluator.js";
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
  /** Data the bindings read; its own keys become the root scope. */
  readonly data?: unknown;
  readonly assets?: RenderAssets;
  /** Needed as soon as the design holds a binding or a `{{` in a text. */
  readonly expressions?: ExpressionEvaluator;
  readonly limits?: Partial<RenderLimits>;
}
