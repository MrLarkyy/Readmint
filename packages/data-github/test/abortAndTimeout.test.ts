import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GitHubDataError,
  loadGitHubData,
  type GitHubFetch,
  type GitHubSourceOptions,
} from "../src/index.js";
import { exchange, FIXTURE_LOGIN, replayFetch, successExchanges } from "./replayFetch.js";

async function loadError(options: Partial<GitHubSourceOptions>): Promise<GitHubDataError> {
  const error: unknown = await loadGitHubData({
    token: "test-token",
    login: FIXTURE_LOGIN,
    pageSize: 2,
    ...options,
  }).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof GitHubDataError)) throw new Error("expected a GitHubDataError");
  return error;
}

/** A sleep that aborts the load and then never ends, as a long wait would. */
function abortingSleep(controller: AbortController, waits: number[]) {
  return (milliseconds: number): Promise<void> => {
    waits.push(milliseconds);
    controller.abort();
    return new Promise<void>(() => undefined);
  };
}

describe("abort", () => {
  test("an abort during a secondary rate-limit wait ends the load at once", async () => {
    const controller = new AbortController();
    const waits: number[] = [];
    const replay = replayFetch([exchange("rate-limit-secondary-403"), ...successExchanges()]);
    const error = await loadError({
      fetch: replay.fetch,
      sleep: abortingSleep(controller, waits),
      signal: controller.signal,
    });
    expect(error.code).toBe("timeout");
    expect(waits).toEqual([2000]);
    expect(replay.requests).toHaveLength(1);
  });

  test("an abort during the 5xx retry delay ends the load at once", async () => {
    const controller = new AbortController();
    const waits: number[] = [];
    const replay = replayFetch([exchange("bad-gateway"), ...successExchanges()]);
    const error = await loadError({
      fetch: replay.fetch,
      sleep: abortingSleep(controller, waits),
      signal: controller.signal,
    });
    expect(error.code).toBe("timeout");
    expect(waits).toEqual([1000]);
    expect(replay.requests).toHaveLength(1);
  });

  test("an already aborted signal sends no request", async () => {
    const replay = replayFetch(successExchanges());
    const error = await loadError({ fetch: replay.fetch, signal: AbortSignal.abort() });
    expect(error.code).toBe("timeout");
    expect(replay.requests).toEqual([]);
  });
});

describe("timeout", () => {
  test("a fetch rejecting with a TimeoutError is timeout", async () => {
    const fetch: GitHubFetch = () =>
      Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
    expect((await loadError({ fetch })).code).toBe("timeout");
  });

  test("requestTimeoutMs aborts a request that does not answer", async () => {
    let signal: AbortSignal | null = null;
    const fetch: GitHubFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init.signal ?? null;
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    const started = performance.now();
    const error = await loadError({ fetch, requestTimeoutMs: 1000 });
    expect(error.code).toBe("timeout");
    expect(signal).not.toBeNull();
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});

describe("redirects", () => {
  test("every request refuses redirects so the Authorization header cannot follow one", async () => {
    const replay = replayFetch(successExchanges());
    const modes: (RequestRedirect | undefined)[] = [];
    await loadGitHubData({
      token: "test-token",
      login: FIXTURE_LOGIN,
      pageSize: 2,
      fetch: (url, init) => {
        modes.push(init.redirect);
        return replay.fetch(url, init);
      },
    });
    expect(modes).toEqual(["error", "error", "error", "error"]);
  });

  test("a refused redirect is a network failure", async () => {
    const fetch: GitHubFetch = () =>
      Promise.reject(new TypeError("fetch failed", { cause: new Error("unexpected redirect") }));
    expect((await loadError({ fetch })).code).toBe("network");
  });
});

describe("the default sleep", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("an abort during a wait clears its timer so nothing keeps the process alive", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const controller = new AbortController();
    const replay = replayFetch([exchange("rate-limit-secondary-403"), ...successExchanges()]);
    const loading = loadError({ fetch: replay.fetch, signal: controller.signal });
    for (let turn = 0; turn < 100 && vi.getTimerCount() === 0; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    expect((await loading).code).toBe("timeout");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("without an abort it waits the full time and the load succeeds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const replay = replayFetch([exchange("rate-limit-secondary-403"), ...successExchanges()]);
    const loading = loadGitHubData({
      token: "test-token",
      login: FIXTURE_LOGIN,
      pageSize: 2,
      fetch: replay.fetch,
      signal: new AbortController().signal,
    });
    for (let turn = 0; turn < 100 && vi.getTimerCount() === 0; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    await vi.advanceTimersByTimeAsync(2000);
    expect((await loading).data.login).toBe(FIXTURE_LOGIN);
    expect(vi.getTimerCount()).toBe(0);
  });
});
