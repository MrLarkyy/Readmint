import { describe, expect, test } from "vitest";
import {
  checkHttpsUrl,
  DataSourceError,
  fetchHttpsText,
  HttpsLimits,
  type FetchHttpsContext,
} from "../src/index.js";

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function stub(...answers: (() => Response)[]): {
  fetch: FetchHttpsContext["fetch"];
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      return answer === undefined
        ? Promise.reject(new Error("no answer"))
        : Promise.resolve(answer());
    },
  };
}

const ok = (body = "text") =>
  new Response(body, { headers: { "content-type": "text/thing; charset=utf-8" } });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

function context(
  fetch: FetchHttpsContext["fetch"],
  extra: Partial<FetchHttpsContext> = {},
): FetchHttpsContext {
  return {
    namespace: "ns",
    label: "thing",
    accept: "text/thing",
    headers: {},
    checkMediaType: (value) => (value?.startsWith("text/thing") ? undefined : "is not a thing"),
    maxBytes: 1024,
    timeoutMs: 5000,
    fetch,
    signal: null,
    ...extra,
  };
}

async function failure(promise: Promise<unknown>): Promise<DataSourceError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof DataSourceError)) throw new Error("expected a DataSourceError");
  return error;
}

const START = new URL("https://a.example/doc");

describe("fetchHttpsText", () => {
  test("returns the text and the request count, sending the accept header", async () => {
    const { fetch, calls } = stub(() => ok("hello"));
    await expect(fetchHttpsText(START, context(fetch))).resolves.toEqual({
      text: "hello",
      requests: 1,
    });
    expect(new Headers(calls[0]?.init.headers).get("accept")).toBe("text/thing");
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      redirect: "manual",
      credentials: "omit",
    });
  });

  test("every message names the label and nothing of the request", async () => {
    const messages = await Promise.all([
      failure(fetchHttpsText(START, context(stub(() => new Response("", { status: 404 })).fetch))),
      failure(
        fetchHttpsText(
          START,
          context(stub(() => new Response("x", { headers: { "content-type": "a/b" } })).fetch),
        ),
      ),
      failure(fetchHttpsText(START, context(stub(() => ok("x".repeat(2000))).fetch))),
      failure(
        fetchHttpsText(
          START,
          context(() => Promise.reject(new TypeError("boom a.example"))),
        ),
      ),
      failure(fetchHttpsText(START, context(stub(() => redirect("http://a.example/")).fetch))),
    ]);
    expect(messages.map((error) => [error.source, error.code, error.message])).toEqual([
      ["ns", "not-found", "The thing URL answered HTTP 404."],
      ["ns", "invalid-response", "The thing URL answer is not a thing."],
      ["ns", "too-large", "The thing document is larger than 1024 bytes."],
      ["ns", "network", "The thing URL could not be reached."],
      ["ns", "invalid-response", "The thing URL redirected to a URL that is not an https URL."],
    ]);
  });

  test("headers go to the first origin only", async () => {
    const { fetch, calls } = stub(
      () => redirect("https://b.example/x"),
      () => redirect("https://a.example/y"),
      () => ok(),
    );
    await fetchHttpsText(START, context(fetch, { headers: { "x-key": "v" } }));
    const sent = calls.map((call) => new Headers(call.init.headers).get("x-key"));
    expect(sent).toEqual(["v", null, "v"]);
  });

  test(`${String(HttpsLimits.maxRedirects)} redirects are followed; one more is refused`, async () => {
    const { fetch, calls } = stub(() => redirect("/again"));
    const error = await failure(fetchHttpsText(START, context(fetch)));
    expect(error.message).toBe("The thing URL redirected more than 3 times.");
    expect(calls).toHaveLength(HttpsLimits.maxRedirects + 1);
  });

  test("an opaque redirect has no usable Location", async () => {
    const opaque = Object.defineProperty(ok(), "type", { value: "opaqueredirect" });
    const error = await failure(fetchHttpsText(START, context(stub(() => opaque).fetch)));
    expect(error.message).toBe("The thing URL redirected without a usable Location.");
  });

  test("a signal aborted before the load is timeout without a request", async () => {
    const { fetch, calls } = stub(() => ok());
    const error = await failure(
      fetchHttpsText(START, context(fetch, { signal: AbortSignal.abort() })),
    );
    expect([error.code, error.message]).toEqual([
      "timeout",
      "The thing request timed out or was aborted.",
    ]);
    expect(calls).toHaveLength(0);
  });
});

describe("checkHttpsUrl", () => {
  test("takes an https URL and refuses the rest without quoting it", () => {
    expect(checkHttpsUrl("https://a.example/x?k=1")).toBeInstanceOf(URL);
    expect(checkHttpsUrl("http://a.example/")).toBe("is not an https URL");
    expect(checkHttpsUrl("https://u:p@a.example/")).toBe("contains a user name or password");
    expect(checkHttpsUrl("https://a.example/ x")).toBe(
      "contains whitespace or a control character",
    );
    expect(checkHttpsUrl(`https://a.example/${"a".repeat(2048)}`)).toBe(
      "is longer than 2048 characters",
    );
    expect(checkHttpsUrl("not a url")).toBe("contains whitespace or a control character");
    expect(checkHttpsUrl("nope")).toBe("is not a valid URL");
  });
});
