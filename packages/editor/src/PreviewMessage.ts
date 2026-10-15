import type { RenderResult } from "@readmint/renderer";
import type { PreviewInput } from "./renderPreview.js";

/** Main thread to preview worker: render `input`, answer with the same `id`. */
export interface PreviewRequest {
  readonly id: number;
  readonly input: PreviewInput;
}

/** Preview worker to main thread: the render result, or the message of an unexpected error. */
export type PreviewResponse =
  | { readonly id: number; readonly result: RenderResult }
  | { readonly id: number; readonly error: string };
