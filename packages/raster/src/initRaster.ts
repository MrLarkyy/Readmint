// The declarations travel with this file into every program that compiles it (the CLI and Action typechecks too).
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./wasmWebp.d.ts" />
import { readFile } from "node:fs/promises";
import { initWasm } from "@resvg/resvg-wasm";
import webpFactory from "wasm-webp/dist/esm/webp-wasm.js";
import { RasterWasm, type RasterWasmName, resolveRasterWasm } from "./RasterWasm.js";
import type { RgbaImage } from "./RgbaImage.js";
import type { WebpCodec } from "./WebpCodec.js";

interface WasmInstance {
  readonly exports: { readonly memory?: { readonly buffer: ArrayBuffer } };
}

// The WebAssembly global of Node, typed here: the ES library the packages compile against does not declare it.
interface WasmApi {
  readonly Module: new (bytes: Uint8Array) => object;
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

/**
 * Loads the rasterizer and compiles libwebp once; later calls return the same promise and ignore `wasmDir`.
 * `wasmDir` is a folder holding the `RasterWasm` files (a bundle ships them there); default: `node_modules`.
 * `exportRaster` calls it itself, so only a bundle needs to.
 */
export async function initRaster(wasmDir?: URL): Promise<void> {
  await loadRaster(wasmDir);
}

function loadRaster(wasmDir?: URL): Promise<Loaded> {
  if (loading === undefined) {
    const started = load(wasmDir);
    loading = started;
    // A failed load can be retried, for example after the files were put in place.
    started.catch(() => {
      if (loading === started) loading = undefined;
    });
  }
  return loading;
}

async function load(wasmDir: URL | undefined): Promise<Loaded> {
  const resolved = wasmDir === undefined ? resolveRasterWasm() : undefined;
  const bytes = (name: RasterWasmName): Promise<Uint8Array> =>
    readFile(resolved?.[name] ?? new URL(RasterWasm[name].file, wasmDir));
  const [resvg, webp] = await Promise.all([bytes("resvg"), bytes("webp")]);
  await initWasm(resvg);
  return { webp: new wasm.Module(webp) };
}

/**
 * A fresh libwebp instance. wasm-webp never frees a decoded image and does not check a failed decode, so each export
 * gets its own instance (dropped with its memory afterwards), and a decode whose pixels are the instance's memory at
 * address 0 (what a failed `WebPDecodeRGBA` returns, with the header's sizes) counts as failed.
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
      if (low.length === decoded.data.length && Buffer.from(low).equals(decoded.data))
        return undefined;
      return { data: decoded.data, width: decoded.width, height: decoded.height };
    },
  };
}
