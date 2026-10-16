// The declarations travel with this file into every program that compiles it (the CLI and Action typechecks too).
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./wasmWebp.d.ts" />
import { initWasm } from "@resvg/resvg-wasm";
import webpFactory from "wasm-webp/dist/esm/webp-wasm.js";
import { sameBytes } from "./sameBytes.js";
import type { RasterModules, RasterWasmBytes } from "./RasterWasmBytes.js";
import type { RgbaImage } from "./RgbaImage.js";
import type { WebpCodec } from "./WebpCodec.js";

interface WasmInstance {
  readonly exports: { readonly memory?: { readonly buffer: ArrayBuffer } };
}

// The WebAssembly global, typed here: the ES library the packages compile against does not declare it.
interface WasmApi {
  readonly Module: new (bytes: RasterWasmBytes) => object;
  readonly Instance: new (module: object, imports: object) => WasmInstance;
}

interface Loaded {
  /** libwebp 1.3.2 (wasm-webp 0.1.0), compiled once and instantiated per export. */
  readonly webp: object;
}

const wasm = (globalThis as unknown as { WebAssembly: WasmApi }).WebAssembly;
// libwebp's lossless effort: its default method (4) with the quality that goes with it.
const lossless = Object.freeze({ lossless: 1, quality: 75 });

let loading: Promise<Loaded> | undefined;
let resvgReady = false;

/**
 * Loads the rasterizer and compiles libwebp once from what `load` returns; later calls return the same promise and
 * ignore `load`. A failed load can be retried, for example after the files were put in place.
 */
export function loadRasterModules(load: () => Promise<RasterModules>): Promise<void> {
  if (loading === undefined) {
    const started = (async (): Promise<Loaded> => {
      const { resvg, webp } = await load();
      // resvg-wasm initialises once per program: a retried load after a libwebp failure must not do it again.
      if (!resvgReady) {
        await initWasm(resvg as Parameters<typeof initWasm>[0]);
        resvgReady = true;
      }
      return { webp: new wasm.Module(webp) };
    })();
    loading = started;
    started.catch(() => {
      if (loading === started) loading = undefined;
    });
  }
  return loading.then(() => undefined);
}

export async function loadRaster(): Promise<Loaded> {
  if (loading === undefined)
    throw new Error("raster modules are not loaded; call initRaster first");
  return loading;
}

/**
 * A fresh libwebp instance. wasm-webp never frees a decoded image and does not check a failed decode, so each export
 * gets its own instance (dropped with its memory afterwards), and a decode whose pixels are the instance's memory at
 * address 0 (what a failed `WebPDecodeRGBA` returns, with the header's sizes) counts as failed. Reported upstream:
 * https://github.com/nieyuyao/webp-wasm/issues/7 — drop both workarounds once a release fixes it.
 */
export async function openWebpCodec(): Promise<WebpCodec> {
  const { webp } = await loadRaster();
  let instance: WasmInstance | undefined;
  const module = await webpFactory({
    // Given compiled, so the Emscripten glue never looks for a file or fetches a URL itself.
    instantiateWasm(imports, callback) {
      instance = new wasm.Instance(webp, imports);
      callback(instance);
      return instance.exports;
    },
  });
  return {
    encodeWebp(image: RgbaImage, quality?: number): Uint8Array {
      const config = quality === undefined ? lossless : { lossless: 0, quality };
      const encoded = module.encode(image.data, image.width, image.height, true, config);
      if (encoded === null) throw new Error("libwebp could not encode a frame");
      return encoded;
    },
    decodeWebp(data: Uint8Array): RgbaImage | undefined {
      let decoded;
      try {
        decoded = module.decodeRGBA(data);
      } catch {
        return undefined;
      }
      if (decoded === null || !(decoded.width > 0 && decoded.height > 0)) return undefined;
      const memory = instance?.exports.memory;
      if (memory === undefined || decoded.data.length !== decoded.width * decoded.height * 4) {
        return undefined;
      }
      const low = new Uint8Array(
        memory.buffer,
        0,
        Math.min(decoded.data.length, memory.buffer.byteLength),
      );
      if (low.length === decoded.data.length && sameBytes(low, decoded.data)) return undefined;
      return { data: decoded.data, width: decoded.width, height: decoded.height };
    },
  };
}

/** Forgets the compiled libwebp so the next load runs again (resvg-wasm stays initialised); tests only. */
export function resetRasterRuntime(): void {
  loading = undefined;
}
