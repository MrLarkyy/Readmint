import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  newDesign,
  RasterClient,
  type RasterExportInput,
  type RasterRequest,
  type RasterResponse,
  type RasterWorker,
} from "../src/index.js";

class StubWorker implements RasterWorker {
  onmessage: ((event: MessageEvent<RasterResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly requests: RasterRequest[] = [];
  terminated = false;

  postMessage(message: RasterRequest): void {
    this.requests.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(response: RasterResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<RasterResponse>);
  }
}

const input: RasterExportInput = {
  design: newDesign(),
  data: {},
  sessionAssets: {},
  format: "png",
};
const file = { format: "png", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) } as const;

let workers: StubWorker[];
let client: RasterClient;

beforeEach(() => {
  vi.useFakeTimers();
  workers = [];
  client = new RasterClient({
    createWorker: () => {
      const worker = new StubWorker();
      workers.push(worker);
      return worker;
    },
    timeoutMs: 1000,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

test("an export posts its input to a fresh worker and ends with the file, terminating the worker", async () => {
  const done = client.export(input);
  expect(workers).toHaveLength(1);
  expect(workers[0]?.requests).toEqual([{ input }]);
  workers[0]?.reply({ file });
  expect(await done).toEqual({ kind: "exported", file });
  expect(workers[0]?.terminated).toBe(true);
  expect(client.busy).toBe(false);
});

test("every export gets a worker of its own", async () => {
  const first = client.export(input);
  workers[0]?.reply({ file });
  await first;
  const second = client.export(input);
  expect(workers).toHaveLength(2);
  workers[1]?.reply({ file });
  await second;
  expect(workers.every((worker) => worker.terminated)).toBe(true);
});

test("a second export is refused while one runs, and the first is not disturbed", async () => {
  const first = client.export(input);
  expect(await client.export(input)).toEqual({ kind: "busy" });
  expect(workers).toHaveLength(1);
  expect(workers[0]?.terminated).toBe(false);
  workers[0]?.reply({ file });
  expect((await first).kind).toBe("exported");
});

test("an export past the timeout is stopped and reported", async () => {
  const done = client.export(input);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await done).toEqual({ kind: "timeout", timeoutMs: 1000 });
  expect(workers[0]?.terminated).toBe(true);
  expect(client.busy).toBe(false);
});

test("a worker that answers with an error ends the export with that message", async () => {
  const done = client.export(input);
  workers[0]?.reply({ error: "png export failed: too big" });
  expect(await done).toEqual({ kind: "failed", message: "png export failed: too big" });
  expect(workers[0]?.terminated).toBe(true);
});

test("a script error and an unreadable message end the export at once", async () => {
  const first = client.export(input);
  workers[0]?.onerror?.({ preventDefault: () => undefined } as ErrorEvent);
  expect((await first).kind).toBe("failed");
  const second = client.export(input);
  workers[1]?.onmessageerror?.({} as MessageEvent);
  expect((await second).kind).toBe("failed");
  expect(workers.every((worker) => worker.terminated)).toBe(true);
});

test("an answer after the end is ignored", async () => {
  const done = client.export(input);
  await vi.advanceTimersByTimeAsync(1000);
  await done;
  workers[0]?.reply({ file });
  expect(client.busy).toBe(false);
});

test("a worker that cannot be created fails the export and a later one can run", async () => {
  let fail = true;
  const retrying = new RasterClient({
    createWorker: () => {
      if (fail) throw new Error("no worker");
      const worker = new StubWorker();
      workers.push(worker);
      return worker;
    },
    timeoutMs: 1000,
  });
  expect((await retrying.export(input)).kind).toBe("failed");
  fail = false;
  const done = retrying.export(input);
  workers[0]?.reply({ file });
  expect((await done).kind).toBe("exported");
});

test("dispose stops a running export", async () => {
  const done = client.export(input);
  client.dispose();
  expect((await done).kind).toBe("failed");
  expect(workers[0]?.terminated).toBe(true);
});

test("a late answer of a finished export does not end the next one", async () => {
  const first = client.export(input);
  await vi.advanceTimersByTimeAsync(1000);
  await first;
  const second = client.export(input);
  workers[0]?.reply({ file });
  expect(client.busy).toBe(true);
  workers[1]?.reply({ file });
  expect((await second).kind).toBe("exported");
});
