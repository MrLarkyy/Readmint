import { compileTemplate, createScope, type ExprValue } from "@readmint/expr";
import type { Design } from "@readmint/format";
import { RenderLimits, sniffImage } from "@readmint/renderer";
import { checkImageUrl } from "./checkImageUrl.js";
import { isBoundSource } from "./isBoundSource.js";
import { quoteForLog } from "./quoteForLog.js";
import { readImageCapped } from "./readImageCapped.js";
import { RemoteImageError } from "./RemoteImageError.js";
import {
  defaultImageHosts,
  RemoteImageLimits,
  type RemoteImageOptions,
} from "./RemoteImageOptions.js";

/**
 * Fetches the bytes of every image asset whose `src` is a `{{binding}}`, used or not, ids in sorted order: the
 * binding is evaluated against the root of `data`, the URL checked (`checkImageUrl`), fetched without any
 * credential, cookie or redirect, and the body checked the way the renderer checks an asset (bytes, magic bytes,
 * pixels per side, frames). The renderer takes the result as `RenderAssets.images` and inlines it like a file
 * asset. The first refusal throws `RemoteImageError` naming the asset.
 */
export async function fetchBoundImages(
  design: Design,
  data: Readonly<Record<string, unknown>> | undefined,
  options: RemoteImageOptions,
): Promise<Record<string, Uint8Array>> {
  const declared = design.assets?.images ?? {};
  const entries: [string, Uint8Array][] = [];
  for (const id of Object.keys(declared).sort()) {
    const src = declared[id]?.src;
    if (src === undefined || !isBoundSource(src)) continue;
    try {
      const url = checkImageUrl(boundUrl(src, data), options.allowedHosts ?? defaultImageHosts);
      entries.push([id, await cachedImage(url.href, options)]);
    } catch (error) {
      if (!(error instanceof RemoteImageError)) throw error;
      throw new RemoteImageError(
        error.code,
        `image asset ${quoteForLog(id)}: ${error.message}`,
        id,
      );
    }
  }
  return Object.fromEntries(entries);
}

function boundUrl(src: string, data: Readonly<Record<string, unknown>> | undefined): string {
  const quoted = quoteForLog(src);
  if (data === undefined) {
    throw new RemoteImageError(
      "image-binding",
      `its src ${quoted} is bound to data, but there is no data`,
    );
  }
  const template = compileTemplate(src);
  if (!template.ok) {
    throw new RemoteImageError("image-binding", `its src ${quoted}: ${template.error.message}`);
  }
  const result = template.value.evaluate(createScope(data));
  if (!result.ok) {
    throw new RemoteImageError("image-binding", `its src ${quoted}: ${result.error.message}`);
  }
  if (typeof result.value !== "string") {
    throw new RemoteImageError(
      "image-binding",
      `its src ${quoted} gives ${kindOf(result.value)}, not a URL`,
    );
  }
  return result.value;
}

function kindOf(value: ExprValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

function cachedImage(url: string, options: RemoteImageOptions): Promise<Uint8Array> {
  let bytes = options.cache.get(url);
  if (bytes === undefined) {
    const max = RemoteImageLimits.maxUrls;
    if (options.cache.size >= max) {
      throw new RemoteImageError(
        "image-fetch",
        `${quoteForLog(url)} is one image URL too many: one run fetches at most ${String(max)}`,
      );
    }
    bytes = fetchImage(url, options);
    options.cache.set(url, bytes);
  }
  return bytes;
}

async function fetchImage(url: string, options: RemoteImageOptions): Promise<Uint8Array> {
  try {
    return checkImage(await download(url, options));
  } catch (error) {
    if (!(error instanceof RemoteImageError)) throw error;
    throw new RemoteImageError(error.code, `${quoteForLog(url)}: ${error.message}`);
  }
}

/** Exactly this request: nothing that could carry a credential, no redirect to re-check. */
function imageRequest(signal: AbortSignal): RequestInit {
  return {
    method: "GET",
    headers: { accept: "image/png,image/jpeg,image/gif,image/webp" },
    redirect: "error",
    credentials: "omit",
    signal,
  };
}

async function download(url: string, options: RemoteImageOptions): Promise<Uint8Array> {
  const timeoutMs = options.timeoutMs ?? RemoteImageLimits.timeoutMs;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal =
    options.signal === undefined ? timeout : AbortSignal.any([timeout, options.signal]);
  try {
    const response = await options.fetch(url, imageRequest(signal));
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new RemoteImageError("image-fetch", `the host answered ${String(response.status)}`);
    }
    return await readImageCapped(response, RenderLimits.maxImageBytes);
  } catch (error) {
    if (error instanceof RemoteImageError) throw error;
    // The error text of fetch is not echoed: it can hold anything the platform put there.
    throw new RemoteImageError(
      "image-fetch",
      options.signal?.aborted === true
        ? "the request was stopped"
        : timeout.aborted
          ? `no answer within ${String(timeoutMs)} ms`
          : "the request failed (network error or redirect)",
    );
  }
}

/** The renderer's asset checks, so a refusal names the URL here instead of failing the render later. */
function checkImage(bytes: Uint8Array): Uint8Array {
  const sniffed = sniffImage(bytes, RenderLimits.maxAnimationFrames);
  if (!sniffed.ok) throw new RemoteImageError("image-format", sniffed.message);
  const { width, height, frames } = sniffed.info;
  const maxSide = RenderLimits.maxImageSide;
  if (width > maxSide || height > maxSide) {
    throw new RemoteImageError(
      "image-too-large",
      `the image is ${String(width)}x${String(height)} pixels; each side may be at most ${String(maxSide)}`,
    );
  }
  if (frames > RenderLimits.maxAnimationFrames) {
    throw new RemoteImageError(
      "image-too-large",
      `the image has more than ${String(RenderLimits.maxAnimationFrames)} animation frames`,
    );
  }
  return bytes;
}
