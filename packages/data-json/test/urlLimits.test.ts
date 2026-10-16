import { describe, expect, test } from "vitest";
import { loadJsonData, type JsonFetch, type JsonSourceOptions } from "../src/index.js";
import { failure, json, redirect, sentHeaders, stubFetch } from "./stubFetch.js";

const SOURCE = "https://api.example/data.json";
const HEADERED: Pick<JsonSourceOptions, "headers" | "env"> = {
  headers: { Authorization: "API_TOKEN" },
  env: { API_TOKEN: "Bearer abc" },
};

const load = (fetch: JsonFetch, extra: Partial<JsonSourceOptions> = {}) =>
  loadJsonData({ source: SOURCE, fetch, ...extra });

describe("URL rules", () => {
  test("http is refused before any request", async () => {
    const stub = stubFetch(() => json("{}"));
    const error = await failure(
      loadJsonData({ source: "http://api.example/x", fetch: stub.fetch }),
    );
    expect(error.code).toBe("invalid-option");
    expect(error.message).toContain("https");
    expect(stub.calls).toHaveLength(0);
  });

  test("a user name or password is refused", async () => {
    const stub = stubFetch(() => json("{}"));
    const error = await failure(
      loadJsonData({ source: "https://user:pass@api.example/x", fetch: stub.fetch }),
    );
    expect(error.code).toBe("invalid-option");
    expect(error.message).not.toContain("user:pass");
    expect(stub.calls).toHaveLength(0);
  });

  test("a URL over 2048 characters or with whitespace is refused", async () => {
    const stub = stubFetch(() => json("{}"));
    const long = await failure(
      loadJsonData({ source: `${SOURCE}?q=${"a".repeat(2048)}`, fetch: stub.fetch }),
    );
    const spaced = await failure(loadJsonData({ source: `${SOURCE} x`, fetch: stub.fetch }));
    expect([long.code, spaced.code]).toEqual(["invalid-option", "invalid-option"]);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("body size", () => {
  test("a declared length over maxBytes is too-large", async () => {
    const stub = stubFetch(() => json("{}", { "content-length": "11" }));
    const error = await failure(load(stub.fetch, { maxBytes: 10 }));
    expect(error.code).toBe("too-large");
  });

  test("a streamed body over maxBytes is too-large", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024).fill(0x20));
      },
    });
    const stub = stubFetch(
      () => new Response(stream, { headers: { "content-type": "application/json" } }),
    );
    const error = await failure(load(stub.fetch, { maxBytes: 4096 }));
    expect(error.code).toBe("too-large");
  });
});

describe("timeout", () => {
  test("a server that never answers is timeout after timeoutMs", async () => {
    const neverAnswers: JsonFetch = () => new Promise<Response>(() => undefined);
    const started = performance.now();
    const error = await failure(load(neverAnswers, { timeoutMs: 1000 }));
    expect(error.code).toBe("timeout");
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  test("a body that never ends is timeout", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
      },
    });
    const stub = stubFetch(
      () => new Response(stream, { headers: { "content-type": "application/json" } }),
    );
    const error = await failure(load(stub.fetch, { timeoutMs: 1000 }));
    expect(error.code).toBe("timeout");
  });

  test("a signal aborted before the load sends no request", async () => {
    const stub = stubFetch(() => json("{}"));
    const error = await failure(load(stub.fetch, { signal: AbortSignal.abort() }));
    expect(error.code).toBe("timeout");
    expect(stub.calls).toHaveLength(0);
  });

  test("a transport error is network with fixed text", async () => {
    const broken: JsonFetch = () =>
      Promise.reject(new TypeError("getaddrinfo ENOTFOUND x.internal"));
    const error = await failure(load(broken));
    expect(error.code).toBe("network");
    expect(error.message).not.toContain("ENOTFOUND");
  });
});

describe("redirects", () => {
  test("three redirects are followed, the fourth is invalid-response", async () => {
    const three = stubFetch(
      () => redirect("/1"),
      () => redirect("/2", 301),
      () => redirect("/3", 307),
      () => json('{"ok":true}'),
    );
    const result = await load(three.fetch);
    expect(result.data.document).toEqual({ ok: true });
    expect(result.meta.requests).toBe(4);
    expect(three.calls.map((call) => call.url)).toEqual([
      SOURCE,
      "https://api.example/1",
      "https://api.example/2",
      "https://api.example/3",
    ]);

    const four = stubFetch(() => redirect("/again", 308));
    const error = await failure(load(four.fetch));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toContain("more than 3");
    expect(four.calls).toHaveLength(4);
  });

  test("a redirect to http is refused without following it", async () => {
    const stub = stubFetch(
      () => redirect("http://api.example/plain"),
      () => json("{}"),
    );
    const error = await failure(load(stub.fetch));
    expect(error.code).toBe("invalid-response");
    expect(stub.calls).toHaveLength(1);
  });

  test("a redirect without a Location is invalid-response", async () => {
    const stub = stubFetch(() => new Response(null, { status: 302 }));
    expect((await failure(load(stub.fetch))).code).toBe("invalid-response");
  });

  test("a cross-origin redirect drops the headers", async () => {
    const stub = stubFetch(
      () => redirect("https://cdn.example/data.json"),
      () => json('{"a":1}'),
    );
    await load(stub.fetch, HEADERED);
    expect(sentHeaders(stub.calls[0])).toMatchObject({ authorization: "Bearer abc" });
    expect(sentHeaders(stub.calls[1])).not.toHaveProperty("authorization");
    expect(JSON.stringify(stub.calls[1]?.init)).not.toContain("Bearer abc");
  });

  test("a redirect back to the first origin after another origin sends them again only there", async () => {
    const stub = stubFetch(
      () => redirect("https://api.example:8443/x"),
      () => redirect("https://api.example/y"),
      () => json("{}"),
    );
    await load(stub.fetch, HEADERED);
    expect(sentHeaders(stub.calls[1])).not.toHaveProperty("authorization");
    expect(sentHeaders(stub.calls[2])).toMatchObject({ authorization: "Bearer abc" });
  });

  test("a same-origin redirect keeps the headers", async () => {
    const stub = stubFetch(
      () => redirect("/moved"),
      () => json("{}"),
    );
    await load(stub.fetch, HEADERED);
    expect(sentHeaders(stub.calls[1])).toMatchObject({ authorization: "Bearer abc" });
  });
});

describe("content type", () => {
  test.each([
    ["application/json"],
    ["application/json; charset=utf-8"],
    ["application/problem+json"],
    ["application/vnd.api+json; charset=UTF-8"],
    ["text/json"],
    ["text/plain; charset=utf-8"],
  ])("%s is accepted", async (type) => {
    const stub = stubFetch(() => json('{"a":1}', { "content-type": type }));
    expect((await load(stub.fetch)).data.document).toEqual({ a: 1 });
  });

  test("text/html is refused, naming the type", async () => {
    const stub = stubFetch(() => json("<html></html>", { "content-type": "text/html" }));
    const error = await failure(load(stub.fetch));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toContain('"text/html"');
  });

  test("a charset other than UTF-8 is refused", async () => {
    const stub = stubFetch(() =>
      json("{}", { "content-type": "application/json; charset=latin1" }),
    );
    const error = await failure(load(stub.fetch));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toContain("latin1");
  });

  test("an absent content type is refused", async () => {
    const stub = stubFetch(() => new Response(new TextEncoder().encode("{}")));
    const error = await failure(load(stub.fetch));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toContain("no content type");
  });

  test("a hostile type is cut to 64 characters and shown without control characters", async () => {
    const type = `application/${"x".repeat(200)}`;
    const stub = stubFetch(() => json("{}", { "content-type": type }));
    const error = await failure(load(stub.fetch));
    expect(error.message).not.toContain("x".repeat(65));
  });
});

describe("status codes", () => {
  test.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not-found"],
    [429, "rate-limited"],
    [500, "invalid-response"],
    [204, "invalid-response"],
  ])("HTTP %d is %s", async (status, code) => {
    const stub = stubFetch(() =>
      status === 204 ? new Response(null, { status }) : json("{}", {}, status),
    );
    const error = await failure(load(stub.fetch));
    expect(error.code).toBe(code);
    if (status !== 204) expect(error.message).toContain(`HTTP ${String(status)}`);
  });
});

describe("header names", () => {
  test("a header named __proto__ is sent as a header, not dropped", async () => {
    const stub = stubFetch(() => json("{}"));
    await load(stub.fetch, {
      headers: JSON.parse('{"__proto__":"PROTO_KEY"}') as Record<string, string>,
      env: { PROTO_KEY: "value" },
    });
    expect(new Headers(stub.calls[0]?.init.headers).get("__proto__")).toBe("value");
  });
});

test("fetch is called unbound, as a browser's fetch requires", async () => {
  const receivers: unknown[] = [];
  const fetch: JsonFetch = function (this: unknown) {
    receivers.push(this);
    return Promise.resolve(json("{}"));
  };
  await load(fetch);
  expect(receivers).toEqual([undefined]);
});
