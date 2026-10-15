import type { DesignArgs } from "./CliCommand.js";
import type { CliIo } from "./CliIo.js";
import type { RemoteImageOptions } from "./RemoteImageOptions.js";

/**
 * The `loadRenderInput` option that fetches images bound from data, only with `--fetch-images`: without it the CLI
 * makes no network request. A fresh cache each call: one per render or validate run, one per preview rebuild. `stop`
 * aborts the requests (the preview passes its stop signal; render and validate finish on the first signal).
 */
export function imageFetching(
  args: DesignArgs,
  io: CliIo,
  stop?: AbortSignal,
): { readonly images?: RemoteImageOptions } {
  if (args.fetchImages !== true) return {};
  const fetch = io.fetch ?? globalThis.fetch;
  return { images: { fetch, cache: new Map(), ...(stop === undefined ? {} : { signal: stop }) } };
}
