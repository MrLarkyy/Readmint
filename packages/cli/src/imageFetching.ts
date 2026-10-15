import type { DesignArgs } from "./CliCommand.js";
import type { CliIo } from "./CliIo.js";
import type { RemoteImageOptions } from "./RemoteImageOptions.js";

/**
 * The `loadRenderInput` option that fetches images bound from data, only with `--fetch-images`: without it the CLI
 * makes no network request. A fresh cache each call: one per render or validate run, one per preview rebuild.
 */
export function imageFetching(
  args: DesignArgs,
  io: CliIo,
): { readonly images?: RemoteImageOptions } {
  if (args.fetchImages !== true) return {};
  return { images: { fetch: io.fetch ?? globalThis.fetch, cache: new Map() } };
}
