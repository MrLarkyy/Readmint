import type { PreviewWorker } from "./PreviewClient.js";

/** The bundled preview worker: an ES module worker the app build emits as its own chunk with the renderer. */
export function createPreviewWorker(): PreviewWorker {
  return new Worker(new URL("./previewWorker.ts", import.meta.url), {
    type: "module",
    name: "readmint-preview",
  });
}
