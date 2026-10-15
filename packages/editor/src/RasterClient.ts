import type { RasterFile, RasterRequest, RasterResponse } from "./RasterMessage.js";
import type { RasterExportInput } from "./RasterExportInput.js";

/** The part of a `Worker` the client uses; tests give a stub. */
export interface RasterWorker {
  onmessage: ((event: MessageEvent<RasterResponse>) => void) | null;
  /** A script error in the worker, or a worker that could not load. */
  onerror: ((event: ErrorEvent) => void) | null;
  /** A message the worker sent that could not be deserialized. */
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: RasterRequest): void;
  terminate(): void;
}

/** What an export ended with. */
export type RasterOutcome =
  | { readonly kind: "exported"; readonly file: RasterFile }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "timeout"; readonly timeoutMs: number }
  | { readonly kind: "busy" };

export interface RasterClientOptions {
  readonly createWorker: () => RasterWorker;
  readonly timeoutMs: number;
}

/**
 * Raster exports, one at a time, each in a worker of its own that is terminated when the export ends: the
 * WebAssembly memory is freed, and a rasterizer trap leaves nothing behind. An export asked for while one runs is
 * refused (`busy`). One that runs past `timeoutMs`, or whose worker fails, is stopped and reported.
 */
export class RasterClient {
  private running = false;
  private stop: (() => void) | undefined;

  constructor(private readonly options: RasterClientOptions) {}

  get busy(): boolean {
    return this.running;
  }

  /** Stops the running export, if any, and reports it as failed. */
  dispose(): void {
    this.stop?.();
  }

  export(input: RasterExportInput): Promise<RasterOutcome> {
    if (this.running) return Promise.resolve({ kind: "busy" });
    this.running = true;
    return new Promise((resolve) => {
      let worker: RasterWorker | undefined;
      let done = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const end = (outcome: RasterOutcome) => {
        if (done) return;
        done = true;
        for (const timer of timers) clearTimeout(timer);
        worker?.terminate();
        this.running = false;
        this.stop = undefined;
        resolve(outcome);
      };
      this.stop = () => {
        end({ kind: "failed", message: "the editor was closed" });
      };
      try {
        worker = this.options.createWorker();
      } catch {
        end({ kind: "failed", message: "the raster worker could not be started" });
        return;
      }
      worker.onmessage = (event) => {
        const response = event.data;
        end(
          "file" in response
            ? { kind: "exported", file: response.file }
            : { kind: "failed", message: response.error },
        );
      };
      worker.onerror = (event) => {
        event.preventDefault();
        end({ kind: "failed", message: "the raster worker stopped with an error" });
      };
      worker.onmessageerror = () => {
        end({ kind: "failed", message: "the raster worker sent a result that could not be read" });
      };
      timers.push(
        setTimeout(() => {
          end({ kind: "timeout", timeoutMs: this.options.timeoutMs });
        }, this.options.timeoutMs),
      );
      try {
        worker.postMessage({ input });
      } catch {
        end({ kind: "failed", message: "the design could not be sent to the raster worker" });
      }
    });
  }
}
