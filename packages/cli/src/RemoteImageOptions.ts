/** The only image host the data sources give URLs for today (`github.avatarUrl`). */
export const defaultImageHosts: readonly string[] = Object.freeze([
  "avatars.githubusercontent.com",
]);

/** Bounds of fetching images bound from data. */
export const RemoteImageLimits = Object.freeze({
  /** Distinct URLs one cache (one CLI or Action run) fetches; each may be up to `RenderLimits.maxImageBytes`. */
  maxUrls: 32,
  /** One request, response body included. */
  timeoutMs: 30_000,
  maxUrlLength: 2048,
});

/** `fetch` as the image requests call it: never one that adds a credential. */
export type ImageFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Fetched bytes by URL; a failed URL keeps its error, so every design binding it fails the same way. */
export type RemoteImageCache = Map<string, Promise<Uint8Array>>;

export interface RemoteImageOptions {
  readonly fetch: ImageFetch;
  /** One per CLI or Action run: each URL is fetched once, at most `RemoteImageLimits.maxUrls` URLs. */
  readonly cache: RemoteImageCache;
  /** Exact host names (as `URL` normalises them); default `defaultImageHosts`. */
  readonly allowedHosts?: readonly string[];
  /** Per request; default `RemoteImageLimits.timeoutMs`. */
  readonly timeoutMs?: number;
}
