// wasm-webp 0.1.0 ships no types for its Emscripten glue; this covers the part raster export uses.
declare module "wasm-webp/dist/esm/webp-wasm.js" {
  interface WasmWebpModule {
    encode(
      data: Uint8Array,
      width: number,
      height: number,
      hasAlpha: boolean,
      config: { lossless: number; quality: number },
    ): Uint8Array | null;
    decodeRGBA(data: Uint8Array): { width: number; height: number; data: Uint8Array } | null;
    decoder_version(): string;
  }

  const factory: (options: {
    instantiateWasm: (
      imports: object,
      callback: (instance: { readonly exports: object }) => void,
    ) => object;
  }) => Promise<WasmWebpModule>;
  export default factory;
}
