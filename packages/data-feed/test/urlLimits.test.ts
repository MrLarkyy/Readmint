import { describe, expect, test } from "vitest";
import { loadFeedData, type FeedFetch } from "../src/index.js";
import { failure, redirect, rss, stubFetch, xml } from "./stubFetch.js";

const URL_SOURCE = "https://feed.example/rss.xml";
const FEED = rss("<item><title>a</title></item>");

const load = (fetch: FeedFetch, extra: { maxBytes?: number; timeoutMs?: number } = {}) =>
  loadFeedData({ url: URL_SOURCE, fetch, ...extra });

describe("URL rules", () => {
  test.each([
    ["http", "http://feed.example/rss.xml"],
    ["file", "file:///etc/passwd"],
    ["a relative path", "feed.xml"],
    ["credentials", "https://user:pw-1234@feed.example/rss.xml"],
    ["over 2048 characters", `${URL_SOURCE}?q=${"a".repeat(2048)}`],
    ["whitespace", `${URL_SOURCE} x`],
  ])("%s is invalid-option before any request", async (_name, url) => {
    const stub = stubFetch(() => xml(FEED));
    const error = await failure(loadFeedData({ url, fetch: stub.fetch }));
    expect(error.code).toBe("invalid-option");
    expect(error.message).toMatch(/^url /);
    expect(error.message).not.toContain("pw-1234");
    expect(error.message).not.toContain("feed.example");
    expect(stub.calls).toHaveLength(0);
  });

  test("a url that is not a string is invalid-option", async () => {
    const error = await failure(loadFeedData({ url: 42 as unknown as string }));
    expect(error.code).toBe("invalid-option");
  });
});

describe("redirects", () => {
  test("three redirects are followed, the fourth is invalid-response", async () => {
    const three = stubFetch(
      () => redirect("/1"),
      () => redirect("/2", 301),
      () => redirect("/3", 307),
      () => xml(FEED),
    );
    const result = await load(three.fetch);
    expect(result.meta.requests).toBe(4);
    const four = stubFetch(() => redirect("/again", 308));
    const error = await failure(load(four.fetch));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe("The feed URL redirected more than 3 times.");
    expect(four.calls).toHaveLength(4);
  });

  test("a redirect to http is refused without following it", async () => {
    const stub = stubFetch(
      () => redirect("http://feed.example/plain"),
      () => xml(FEED),
    );
    const error = await failure(load(stub.fetch));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe("The feed URL redirected to a URL that is not an https URL.");
    expect(stub.calls).toHaveLength(1);
  });

  test("relative links resolve against the URL as given, not the redirect target", async () => {
    const stub = stubFetch(
      () => redirect("https://cdn.example/deep/feed.xml"),
      () => xml(rss("<item><link>post</link></item>")),
    );
    const { data } = await load(stub.fetch);
    expect(data.entries[0]?.link).toBe("https://feed.example/post");
  });
});

describe("status and content type", () => {
  test.each([
    [404, "not-found"],
    [429, "rate-limited"],
    [500, "invalid-response"],
  ])("HTTP %d is %s", async (status, code) => {
    const error = await failure(load(stubFetch(() => xml("", {}, status)).fetch));
    expect(error.code).toBe(code);
    expect(error.message).toBe(`The feed URL answered HTTP ${String(status)}.`);
  });

  test.each([
    ["application/rss+xml"],
    ["application/atom+xml; charset=UTF-8"],
    ["application/xml"],
    ["text/xml; charset=utf-8"],
    ["application/feed+xml"],
    ["text/plain"],
  ])("%s is accepted", async (type) => {
    const { data } = await load(stubFetch(() => xml(FEED, { "content-type": type })).fetch);
    expect(data.entries).toHaveLength(1);
  });

  test("text/html is refused, naming the type", async () => {
    const stub = stubFetch(() => xml("<html></html>", { "content-type": "text/html" }));
    const error = await failure(load(stub.fetch));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe('The feed URL answer has content type "text/html", not XML.');
  });

  test("a latin1 charset is refused", async () => {
    const stub = stubFetch(() => xml(FEED, { "content-type": "application/xml; charset=latin1" }));
    const error = await failure(load(stub.fetch));
    expect(error.message).toBe('The feed URL answer has charset "latin1", not UTF-8.');
  });

  test("the request asks for feed types", async () => {
    const stub = stubFetch(() => xml(FEED));
    await load(stub.fetch);
    expect(new Headers(stub.calls[0]?.init.headers).get("accept")).toContain("application/rss+xml");
    expect(stub.calls[0]?.init).toMatchObject({ redirect: "manual", credentials: "omit" });
  });
});

describe("size and time", () => {
  test("a declared length over maxBytes is too-large", async () => {
    const error = await failure(
      load(stubFetch(() => xml(FEED, { "content-length": "1025" })).fetch, { maxBytes: 1024 }),
    );
    expect(error.code).toBe("too-large");
    expect(error.message).toBe("The feed document is larger than 1024 bytes.");
  });

  test("a streamed body over maxBytes is too-large", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024).fill(0x20));
      },
    });
    const error = await failure(load(stubFetch(() => xml(stream)).fetch, { maxBytes: 4096 }));
    expect(error.code).toBe("too-large");
  });

  test("a server that never answers is timeout", async () => {
    const neverAnswers: FeedFetch = () => new Promise<Response>(() => undefined);
    const error = await failure(load(neverAnswers, { timeoutMs: 1000 }));
    expect(error.code).toBe("timeout");
    expect(error.message).toBe("The feed request timed out or was aborted.");
  });

  test("an aborted signal sends no request", async () => {
    const stub = stubFetch(() => xml(FEED));
    const error = await failure(
      loadFeedData({ url: URL_SOURCE, fetch: stub.fetch, signal: AbortSignal.abort() }),
    );
    expect(error.code).toBe("timeout");
    expect(stub.calls).toHaveLength(0);
  });

  test("a transport error is network with fixed text", async () => {
    const broken: FeedFetch = () => Promise.reject(new TypeError("getaddrinfo ENOTFOUND x"));
    const error = await failure(load(broken));
    expect(error.code).toBe("network");
    expect(error.message).toBe("The feed URL could not be reached.");
  });

  test.each([
    ["maxBytes", { maxBytes: 0 }],
    ["maxBytes", { maxBytes: 8 * 1024 * 1024 + 1 }],
    ["timeoutMs", { timeoutMs: 999 }],
    ["cacheTtlSeconds", { cacheTtlSeconds: 1.5 }],
  ])("%s out of range is invalid-option", async (name, extra) => {
    const stub = stubFetch(() => xml(FEED));
    const error = await failure(loadFeedData({ url: URL_SOURCE, fetch: stub.fetch, ...extra }));
    expect(error.code).toBe("invalid-option");
    expect(error.message).toContain(name);
    expect(stub.calls).toHaveLength(0);
  });
});
