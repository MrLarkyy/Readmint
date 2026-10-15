import { readFile } from "node:fs/promises";
import webpDecoderFactory from "@jsquash/webp/codec/dec/webp_dec.js";
import webpEncoderFactory from "@jsquash/webp/codec/enc/webp_enc_simd.js";
import { initWasm } from "@resvg/resvg-wasm";
import type { RasterCodecs, RgbaImage } from "./RasterCodecs.js";
import { RasterWasm, type RasterWasmName, resolveRasterWasm } from "./RasterWasm.js";

interface WasmInstance {
  readonly exports: object;
}

// The WebAssembly global of Node, typed here: the ES library the packages compile against does not declare it.
interface WasmApi {
  readonly Module: new (bytes: Uint8Array) => object;
  readonly Instance: new (module: object, imports: object) => WasmInstance;
}

interface EmscriptenOptions {
  noInitialRun: boolean;
  instantiateWasm: (imports: object, callback: (instance: WasmInstance) => void) => object;
}

interface WebpEncoderModule {
  encode(data: Uint8Array, width: number, height: number, options: object): Uint8Array | null;
}

interface WebpDecoderModule {
  decode(data: Uint8Array): { data: Uint8ClampedArray; width: number; height: number } | null;
}

type Factory<M> = (options: EmscriptenOptions) => Promise<M>;

// libwebp's defaults (jSquash meta.js) with lossless on; `exact` keeps the colour under transparent pixels.
const losslessOptions = Object.freeze({
  quality: 75,
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 1,
  exact: 1,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0,
});

let loading: Promise<RasterCodecs> | undefined;

/**
 * Loads the rasterizer and the WebP codecs once; later calls return the same promise and ignore `wasmDir`.
 * `wasmDir` is a folder holding the `RasterWasm` files (a bundle ships them there); default: `node_modules`.
 * `exportRaster` calls it itself, so only a bundle needs to.
 */
export async function initRaster(wasmDir?: URL): Promise<void> {
  await rasterCodecs(wasmDir);
}

/** The loaded codecs, loading them first when needed. */
export function rasterCodecs(wasmDir?: URL): Promise<RasterCodecs> {
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

async function load(wasmDir: URL | undefined): Promise<RasterCodecs> {
  const resolved = wasmDir === undefined ? resolveRasterWasm() : undefined;
  const bytes = (name: RasterWasmName): Promise<Uint8Array> =>
    readFile(resolved?.[name] ?? new URL(RasterWasm[name].file, wasmDir));
  const [resvg, encoderWasm, decoderWasm] = await Promise.all([
    bytes("resvg"),
    bytes("webpEncoder"),
    bytes("webpDecoder"),
  ]);
  await initWasm(resvg);
  const encoder = await (webpEncoderFactory as unknown as Factory<WebpEncoderModule>)(
    emscriptenOptions(encoderWasm),
  );
  const decoder = await (webpDecoderFactory as unknown as Factory<WebpDecoderModule>)(
    emscriptenOptions(decoderWasm),
  );
  return {
    encodeWebp(image: RgbaImage): Uint8Array {
      const encoded = encoder.encode(image.data, image.width, image.height, losslessOptions);
      if (encoded === null) throw new Error("libwebp could not encode a frame");
      return Uint8Array.from(encoded);
    },
    decodeWebp(data: Uint8Array): RgbaImage | undefined {
      const decoded = decoder.decode(data);
      if (decoded === null) return undefined;
      // A copy: the decoder's array may be a view of its memory, which the next call reuses.
      return {
        data: new Uint8Array(decoded.data),
        width: decoded.width,
        height: decoded.height,
      };
    },
  };
}

// The modules are given compiled, so the Emscripten glue never looks for a file or fetches a URL itself.
function emscriptenOptions(wasm: Uint8Array): EmscriptenOptions {
  const api = (globalThis as unknown as { WebAssembly: WasmApi }).WebAssembly;
  const module = new api.Module(wasm);
  return {
    noInitialRun: true,
    instantiateWasm(imports, callback) {
      const instance = new api.Instance(module, imports);
      callback(instance);
      return instance.exports;
    },
  };
}
