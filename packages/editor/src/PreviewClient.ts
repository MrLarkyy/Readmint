import type { RenderResult } from "@readmint/renderer";
import type { PreviewRequest, PreviewResponse } from "./PreviewMessage.js";
import type { PreviewInput } from "./renderPreview.js";

/** The part of a `Worker` the client uses; tests give a stub. */
export interface PreviewWorker {
  onmessage: ((event: MessageEvent<PreviewResponse>) => void) | null;
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
 * a newer one. A render that runs past `timeoutMs` has its worker terminated and replaced, and is reported.
 */
export class PreviewClient {
  private worker: PreviewWorker;
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
    clearTimeout(this.timer);
    this.worker.terminate();
    this.running = undefined;
    this.waiting = undefined;
    this.settle();
  }

  private spawn(): PreviewWorker {
    const worker = this.options.createWorker();
    worker.onmessage = (event) => {
      this.receive(event.data);
    };
    return worker;
  }

  private start(input: PreviewInput): void {
    const id = this.nextId++;
    this.running = id;
    this.worker.postMessage({ id, input });
    this.timer = setTimeout(() => {
      this.expire(id);
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

  private expire(id: number): void {
    if (id !== this.running) return;
    this.worker.terminate();
    this.worker = this.spawn();
    this.running = undefined;
    if (this.waiting === undefined) {
      this.options.onOutcome({ kind: "timeout", timeoutMs: this.options.timeoutMs });
    }
    this.next();
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
