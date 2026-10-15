/** Stable reason an image bound from data was refused; part of the public contract (docs/asset-loading.md). */
export type RemoteImageErrorCode =
  /** The `src` binding does not evaluate, gives no string, or there is no data. */
  | "image-binding"
  /** Not a URL, not https, a user name, password or port in it, or longer than 2048 characters. */
  | "image-url"
  /** The host is not on the allow-list. */
  | "image-host"
  /** Network failure, timeout, redirect, a non-2xx status, or more distinct URLs than one run may fetch. */
  | "image-fetch"
  /** More bytes, pixels per side or animation frames than the renderer takes. */
  | "image-too-large"
  /** The bytes are no PNG, JPEG, GIF or WebP image the renderer accepts. */
  | "image-format"
  /** The design binds an image `src`, there is data, and fetching is off (the CLI without `--fetch-images`). */
  | "image-not-fetched";

/**
 * Why an image asset whose `src` is bound to data got no bytes. The message names the asset and the URL (quoted and
 * escaped), never a request header.
 */
export class RemoteImageError extends Error {
  override readonly name = "RemoteImageError";
  readonly code: RemoteImageErrorCode;
  /** The image asset id; absent while only the URL is known. */
  readonly asset: string | undefined;

  constructor(code: RemoteImageErrorCode, message: string, asset?: string) {
    super(message);
    this.code = code;
    this.asset = asset;
  }
}
