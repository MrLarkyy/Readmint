import { describe, expect, test } from "vitest";
import { DataSourceError } from "../src/DataSourceError.js";
import { requestApiText, type ApiRequestContext } from "../src/requestApiText.js";

type Answer = (url: string) => Response | Promise<Response>;

function context(
  answers: Answer[],
  overrides: Partial<ApiRequestContext> = {},
): { ctx: ApiRequestContext; urls: string[]; inits: RequestInit[]; waits: number[] } {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  const waits: number[] = [];
  let index = 0;
  const ctx: ApiRequestContext = {
    namespace: "demo",
    label: "Demo",
    headers: [["accept", "application/json"]],
    accepted: new Set([200, 404]),
    bodied: new Set([200]),
    typed: new Set([200]),
    maxBytes: 1000,
    signal: AbortSignal.timeout(5000),
    fetch: (url, init) => {
      urls.push(url);
      inits.push(init);
      const answer = answers[Math.min(index, answers.length - 1)];
      index += 1;
      return Promise.resolve(answer?.(url) ?? new Response(null, { status: 500 }));
    },
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    maxRetryWaitSeconds: 10,
    serverRetryDelayMs: 1000,
    statusFailure: (status) => ({
      code: "invalid-response",
      message: `The Demo API answered HTTP ${String(status)}.`,
    }),
    ...overrides,
  };
  return { ctx, urls, inits, waits };
}

const json = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "application/json", ...headers } });

async function failure(promise: Promise<unknown>): Promise<DataSourceError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof DataSourceError)) throw new Error("expected a DataSourceError");
  return error;
}

describe("requestApiText", () => {
  test("returns the text of an accepted status with the request options fixed", async () => {
    const { ctx, inits } = context([() => json('{"a":1}')]);
    await expect(requestApiText("https://example.org/x", ctx)).resolves.toEqual({
      status: 200,
      text: '{"a":1}',
      requests: 1,
    });
    expect(inits[0]).toMatchObject({ method: "GET", redirect: "manual", credentials: "omit" });
  });

  test("an accepted status without a body is not read", async () => {
    const { ctx } = context([() => new Response("<html>", { status: 404 })]);
    await expect(requestApiText("https://example.org/x", ctx)).resolves.toEqual({
      status: 404,
      text: "",
      requests: 1,
    });
  });

  test("refuses a redirect after one request", async () => {
    const { ctx, urls } = context([
      () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
    ]);
    const error = await failure(requestApiText("https://example.org/x", ctx));
    expect(error.message).toBe("The Demo API redirected; no redirect is followed.");
    expect(urls).toHaveLength(1);
  });

  test("refuses an opaque redirect", async () => {
    const opaque = Object.defineProperty(new Response(null), "type", { value: "opaqueredirect" });
    const { ctx } = context([() => opaque]);
    const error = await failure(requestApiText("https://example.org/x", ctx));
    expect(error.code).toBe("invalid-response");
  });

  test("waits out a 429 once and refuses a long or second one", async () => {
    const limited = (after: string) => () =>
      new Response(null, { status: 429, headers: { "retry-after": after } });
    const waited = context([limited("3"), () => json("{}")]);
    await expect(requestApiText("https://example.org/x", waited.ctx)).resolves.toMatchObject({
      requests: 2,
    });
    expect(waited.waits).toEqual([3000]);
    const long = await failure(
      requestApiText("https://example.org/x", context([limited("11")]).ctx),
    );
    expect(long.code).toBe("rate-limited");
    expect(long.message).toBe(
      "The Demo API rate limit was hit (HTTP 429); retry after 11 seconds.",
    );
    const twice = context([limited("1")]);
    expect((await failure(requestApiText("https://example.org/x", twice.ctx))).code).toBe(
      "rate-limited",
    );
    expect(twice.urls).toHaveLength(2);
    const none = await failure(
      requestApiText(
        "https://example.org/x",
        context([() => new Response(null, { status: 429 })]).ctx,
      ),
    );
    expect(none.message).toBe("The Demo API rate limit was hit (HTTP 429); retry later.");
  });

  test("retries a server error once", async () => {
    const retried = context([() => new Response(null, { status: 503 }), () => json("{}")]);
    await expect(requestApiText("https://example.org/x", retried.ctx)).resolves.toMatchObject({
      requests: 2,
    });
    expect(retried.waits).toEqual([1000]);
    const failed = context([() => new Response(null, { status: 502 })]);
    const error = await failure(requestApiText("https://example.org/x", failed.ctx));
    expect(error.message).toBe("The Demo API answered HTTP 502.");
    expect(failed.urls).toHaveLength(2);
  });

  test("caps the body and checks the media type and UTF-8", async () => {
    const big = await failure(
      requestApiText("https://example.org/x", context([() => json("x".repeat(1001))]).ctx),
    );
    expect(big.code).toBe("too-large");
    const html = await failure(
      requestApiText(
        "https://example.org/x",
        context([() => new Response("{}", { headers: { "content-type": "text/html" } })]).ctx,
      ),
    );
    expect(html.message).toBe('The Demo answer has content type "text/html", not JSON.');
    const bytes = await failure(
      requestApiText(
        "https://example.org/x",
        context([
          () =>
            new Response(new Uint8Array([0xff]), {
              headers: { "content-type": "application/json" },
            }),
        ]).ctx,
      ),
    );
    expect(bytes.message).toBe("The Demo answer is not valid UTF-8.");
  });

  test("an untyped bodied status may be empty but not another type", async () => {
    const options = { accepted: new Set([200, 202]), bodied: new Set([200, 202]) };
    const empty = context([() => new Response(null, { status: 202 })], options);
    await expect(requestApiText("https://example.org/x", empty.ctx)).resolves.toMatchObject({
      status: 202,
      text: "",
    });
    const text = context(
      [() => new Response("busy", { status: 202, headers: { "content-type": "text/plain" } })],
      options,
    );
    expect((await failure(requestApiText("https://example.org/x", text.ctx))).code).toBe(
      "invalid-response",
    );
  });

  test("times out, also when the fetch ignores the signal", async () => {
    const hang = context([() => new Response(null)], {
      signal: AbortSignal.abort(),
    });
    expect((await failure(requestApiText("https://example.org/x", hang.ctx))).code).toBe("timeout");
    const never = context([() => new Promise<Response>(() => undefined)], {
      signal: AbortSignal.timeout(20),
    });
    const error = await failure(requestApiText("https://example.org/x", never.ctx));
    expect(error.message).toBe("The Demo request timed out or was aborted.");
  });

  test("a network error gives fixed text and the secret is redacted", async () => {
    const down = context(
      [
        () => {
          throw new Error("connect ECONNREFUSED hunter2");
        },
      ],
      { secret: "hunter2" },
    );
    const error = await failure(requestApiText("https://example.org/x", down.ctx));
    expect(error.code).toBe("network");
    expect(error.message).toBe("The Demo API could not be reached.");
    const odd = context([() => json("{}", 418)], {
      secret: "teapot",
      statusFailure: () => ({ code: "invalid-response", message: "no teapot here" }),
    });
    expect((await failure(requestApiText("https://example.org/x", odd.ctx))).message).toBe(
      "no *** here",
    );
  });
});

describe("the accepted media types", () => {
  const xml = { types: new Set(["application/xml", "text/xml"]), suffix: "xml", kind: "XML" };
  const answer =
    (type: string): Answer =>
    () =>
      new Response("<a/>", { status: 200, headers: { "content-type": type } });

  test.each(["application/xml", "text/xml; charset=UTF-8", "application/atom+xml"])(
    "%s is taken when the caller asks for XML",
    async (type) => {
      const { ctx } = context([answer(type)], { content: xml });
      expect((await requestApiText("https://example.org/x", ctx)).text).toBe("<a/>");
    },
  );

  test("JSON is refused as XML, and XML as JSON by default", async () => {
    const asJson = context([answer("application/json")], { content: xml });
    expect((await failure(requestApiText("https://example.org/x", asJson.ctx))).message).toBe(
      'The Demo answer has content type "application/json", not XML.',
    );
    const asXml = context([answer("application/xml")]);
    expect((await failure(requestApiText("https://example.org/x", asXml.ctx))).message).toBe(
      'The Demo answer has content type "application/xml", not JSON.',
    );
  });

  test("an XML charset other than UTF-8 is refused", async () => {
    const { ctx } = context([answer("text/xml; charset=iso-8859-1")], { content: xml });
    expect((await failure(requestApiText("https://example.org/x", ctx))).message).toContain(
      "charset",
    );
  });
});
