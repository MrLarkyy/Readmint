import type { RenderResult } from "@readmint/renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  newDesign,
  PreviewClient,
  type PreviewInput,
  type PreviewOutcome,
  type PreviewRequest,
  type PreviewResponse,
  type PreviewWorker,
} from "../src/index.js";

/** A worker that answers only when the test says so: renders that never end are the hostile case. */
class StubWorker implements PreviewWorker {
  onmessage: ((event: MessageEvent<PreviewResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly requests: PreviewRequest[] = [];
  terminated = false;

  postMessage(message: PreviewRequest): void {
    this.requests.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  answer(index: number, svg: string): void {
    const request = this.requests[index];
    if (request === undefined) throw new Error(`no request ${String(index)}`);
    const result: RenderResult = {
      ok: true,
      svg,
      report: { bytes: svg.length, limit: 0, fonts: [], images: [] },
      warnings: [],
    };
    this.onmessage?.({ data: { id: request.id, result } } as MessageEvent<PreviewResponse>);
  }
}

function input(width: number): PreviewInput {
  return { design: newDesign(width), data: {}, sessionAssets: {} };
}

let workers: StubWorker[];
let outcomes: PreviewOutcome[];
let client: PreviewClient;

beforeEach(() => {
  vi.useFakeTimers();
  workers = [];
  outcomes = [];
  client = new PreviewClient({
    createWorker: () => {
      const worker = new StubWorker();
      workers.push(worker);
      return worker;
    },
    timeoutMs: 10_000,
    onOutcome: (outcome) => outcomes.push(outcome),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const svgs = () =>
  outcomes.map((outcome) =>
    outcome.kind === "rendered" && outcome.result.ok ? outcome.result.svg : outcome.kind,
  );

test("delivers a finished render", () => {
  client.render(input(1));
  workers[0]?.answer(0, "a");
  expect(svgs()).toEqual(["a"]);
});

test("a newer request wins: the stale render is dropped, only the latest waiting one runs", () => {
  client.render(input(1));
  client.render(input(2));
  client.render(input(3));
  const worker = workers[0];
  expect(worker?.requests.map((request) => request.input.design.canvas.width)).toEqual([1]);
  worker?.answer(0, "stale");
  expect(svgs()).toEqual([]);
  expect(worker?.requests.map((request) => request.input.design.canvas.width)).toEqual([1, 3]);
  worker?.answer(1, "latest");
  expect(svgs()).toEqual(["latest"]);
});

test("an answer to an old id is ignored", () => {
  client.render(input(1));
  workers[0]?.answer(0, "a");
  workers[0]?.answer(0, "again");
  expect(svgs()).toEqual(["a"]);
});

test("a render past the timeout terminates the worker, reports it and starts a new worker", async () => {
  client.render(input(1));
  const idle = client.idle();
  vi.advanceTimersByTime(9_999);
  expect(outcomes).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(workers[0]?.terminated).toBe(true);
  expect(outcomes).toEqual([{ kind: "timeout", timeoutMs: 10_000 }]);
  await idle;
  client.render(input(2));
  expect(workers).toHaveLength(2);
  workers[1]?.answer(0, "b");
  expect(svgs()).toEqual(["timeout", "b"]);
});

test("after a timeout the waiting request runs on the new worker", () => {
  client.render(input(1));
  client.render(input(2));
  vi.advanceTimersByTime(10_000);
  expect(outcomes).toEqual([]);
  expect(workers[1]?.requests.map((request) => request.input.design.canvas.width)).toEqual([2]);
  workers[1]?.answer(0, "b");
  expect(svgs()).toEqual(["b"]);
});

test("an error in the worker is reported", () => {
  client.render(input(1));
  const request = workers[0]?.requests[0];
  workers[0]?.onmessage?.({
    data: { id: request?.id ?? 0, error: "boom" },
  } as MessageEvent<PreviewResponse>);
  expect(outcomes).toEqual([{ kind: "failed", message: "boom" }]);
});

test.each([
  [
    "an error event",
    (worker: StubWorker) => worker.onerror?.(new Event("error") as ErrorEvent),
    "stopped with an error",
  ],
  [
    "a message error",
    (worker: StubWorker) => worker.onmessageerror?.(new MessageEvent("messageerror")),
    "could not be read",
  ],
] as const)("%s in the worker is reported at once, not at the timeout", (_name, raise, message) => {
  client.render(input(1));
  const first = workers[0];
  if (first === undefined) throw new Error("no worker");
  raise(first);
  expect(outcomes).toEqual([
    { kind: "failed", message: expect.stringContaining(message) as string },
  ]);
  expect(first.terminated).toBe(true);
  vi.advanceTimersByTime(10_000);
  expect(outcomes).toHaveLength(1);
  // A late event of the replaced worker changes nothing; the next render gets a new worker.
  first.answer(0, "late");
  client.render(input(2));
  workers[1]?.answer(0, "b");
  expect(svgs()).toEqual(["failed", "b"]);
});

test("a worker that fails while idle is replaced only when the next render needs one", () => {
  workers[0]?.onerror?.(new Event("error") as ErrorEvent);
  expect(outcomes).toEqual([]);
  expect(workers).toHaveLength(1);
  client.render(input(1));
  expect(workers).toHaveLength(2);
  workers[1]?.answer(0, "a");
  expect(svgs()).toEqual(["a"]);
});

test("an error while a newer request waits starts that request instead of reporting", () => {
  client.render(input(1));
  client.render(input(2));
  workers[0]?.onerror?.(new Event("error") as ErrorEvent);
  expect(outcomes).toEqual([]);
  expect(workers[1]?.requests.map((request) => request.input.design.canvas.width)).toEqual([2]);
});
