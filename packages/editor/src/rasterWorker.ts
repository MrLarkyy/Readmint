import { initRaster } from "@readmint/raster/browser";
import resvgUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import webpUrl from "wasm-webp/dist/esm/webp-wasm.wasm?url";
import type { RasterRequest, RasterResponse } from "./RasterMessage.js";
import { renderRasterExport } from "./renderRasterExport.js";

/** The part of a dedicated worker's global scope this entry uses (the DOM library has no worker types). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<RasterRequest>) => void) | null;
  postMessage(message: RasterResponse, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;

async function wasmBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`the raster module ${url} could not be loaded`);
  return response.arrayBuffer();
}

// The worker serves one export and is then terminated: its WebAssembly memory goes with it.
scope.onmessage = (event) => {
  const { input } = event.data;
  void (async () => {
    try {
      const [resvg, webp] = await Promise.all([wasmBytes(resvgUrl), wasmBytes(webpUrl)]);
      await initRaster({ resvg, webp });
      const output = await renderRasterExport(input);
      const { bytes } = output;
      const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
      scope.postMessage(
        { file: { format: input.format, mimeType: output.mimeType, bytes } },
        whole ? [bytes.buffer as ArrayBuffer] : [],
      );
    } catch (error) {
      scope.postMessage({ error: error instanceof Error ? error.message : "the export failed" });
    }
  })();
};
