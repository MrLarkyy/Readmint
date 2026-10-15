/** The bytes of a WebAssembly module. */
export type RasterWasmBytes = ArrayBuffer | ArrayBufferView;

/** The two modules raster export needs, as bytes (`RasterWasm` names them). */
export interface RasterModules {
  readonly resvg: RasterWasmBytes;
  readonly webp: RasterWasmBytes;
}
