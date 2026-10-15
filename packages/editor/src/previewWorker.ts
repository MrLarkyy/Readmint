import type { PreviewRequest, PreviewResponse } from "./PreviewMessage.js";
import { renderPreview } from "./renderPreview.js";

/** The part of a dedicated worker's global scope this entry uses (the DOM library has no worker types). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<PreviewRequest>) => void) | null;
  postMessage(message: PreviewResponse): void;
}

const scope = globalThis as unknown as WorkerScope;

// A hostile design can only keep this worker busy: the page stays responsive and stops it after the timeout.
scope.onmessage = (event) => {
  const { id, input } = event.data;
  try {
    scope.postMessage({ id, result: renderPreview(input) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : "the render failed" });
  }
};
