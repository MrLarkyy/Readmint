import type { RenderResult } from "@readmint/renderer";
import type { PreviewRequest, PreviewResponse } from "./PreviewMessage.js";
import type { PreviewInput } from "./renderPreview.js";

/** The part of a `Worker` the client uses; tests give a stub. */
export interface PreviewWorker {
  onmessage: ((event: MessageEvent<PreviewResponse>) => void) | null;
  /** A script error in the worker, or a worker that could not load. */
  onerror: ((event: ErrorEvent) => void) | null;
  /** A message the worker sent that could not be deserialized. */
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: PreviewRequest): void;
  terminate(): void;
}

/** What a requested render ended with; only the latest request's outcome is ever delivered. */
export type PreviewOutcome =
  | { readonly kind: "rendered"; readonly result: RenderResult }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "timeout"; readonly timeoutMs: number };

export interface PreviewClientOptions {
  readonly createWorker: () => PreviewWorker;
  readonly timeoutMs: number;
  readonly onOutcome: (outcome: PreviewOutcome) => void;
}

/**
 * Renders previews in a worker, one at a time. A request made while one runs waits, replacing any request that was
 * waiting; the running render's result is dropped when a newer request exists, so a stale render never overwrites
 * a newer one. A render that runs past `timeoutMs` has its worker terminated and is reported; a worker that fails
 * (an error event, a result it cannot send) is terminated and its render reported at once. The next render starts a
 * new worker, so a worker that cannot even load fails each render once, never in a loop.
 */
export class PreviewClient {
  /** The worker renders run in; undefined after it failed or timed out, until the next render needs one. */
  private worker: PreviewWorker | undefined;
  private running: number | undefined;
  private waiting: PreviewInput | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 1;
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly options: PreviewClientOptions) {
    this.worker = this.spawn();
  }

  /** Asks for a render of `input`; the outcome goes to `onOutcome` unless a newer request comes first. */
  render(input: PreviewInput): void {
    if (this.running === undefined) this.start(input);
    else this.waiting = input;
  }

  /** Resolves once no render runs or waits. */
  idle(): Promise<void> {
    if (this.running === undefined) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  dispose(): void {
    this.stopWorker();
    this.running = undefined;
    this.waiting = undefined;
    this.settle();
  }

  private spawn(): PreviewWorker {
    const worker = this.options.createWorker();
    // Events of a worker already replaced are ignored: they belong to no render that still counts.
    worker.onmessage = (event) => {
      if (worker === this.worker) this.receive(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (worker === this.worker) this.fail("the preview worker stopped with an error");
    };
    worker.onmessageerror = () => {
      if (worker === this.worker)
        this.fail("the preview worker sent a result that could not be read");
    };
    return worker;
  }

  private start(input: PreviewInput): void {
    const id = this.nextId++;
    this.running = id;
    this.worker ??= this.spawn();
    this.worker.postMessage({ id, input });
    this.timer = setTimeout(() => {
      if (id === this.running) this.end({ kind: "timeout", timeoutMs: this.options.timeoutMs });
    }, this.options.timeoutMs);
  }

  private receive(response: PreviewResponse): void {
    if (response.id !== this.running) return;
    clearTimeout(this.timer);
    this.running = undefined;
    if (this.waiting === undefined) {
      this.options.onOutcome(
        "result" in response
          ? { kind: "rendered", result: response.result }
          : { kind: "failed", message: response.error },
      );
    }
    this.next();
  }

  /** The worker failed outside a render's own result: the running render is reported at once, not at the timeout. */
  private fail(message: string): void {
    if (this.running === undefined) {
      // Nothing to report (a worker that failed to load while idle): the next render starts a fresh one.
      this.stopWorker();
      return;
    }
    this.end({ kind: "failed", message });
  }

  /**
   * Ends the running render without a result: its worker is stopped (the next render starts a new one) and the
   * outcome reported unless a newer request waits, which then starts.
   */
  private end(outcome: PreviewOutcome): void {
    this.stopWorker();
    this.running = undefined;
    if (this.waiting === undefined) this.options.onOutcome(outcome);
    this.next();
  }

  private stopWorker(): void {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = undefined;
  }

  private next(): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    if (waiting === undefined) this.settle();
    else this.start(waiting);
  }

  private settle(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}
