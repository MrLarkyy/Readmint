import { describe, expect, test } from "vitest";
import { loadRegistryData, RegistryLimits } from "../src/index.js";
import { failure, fakeSleep, json, registryApis, stubFetch } from "./stubFetch.js";

const NPM = { npm: ["react"] };
const MAVEN = { maven: ["junit:junit"] };

async function fails(
  options: Parameters<typeof loadRegistryData>[0],
  answer: Parameters<typeof stubFetch>[0],
) {
  const stub = stubFetch(answer);
  const { sleep } = fakeSleep();
  return { error: await failure(loadRegistryData({ ...options, fetch: stub.fetch, sleep })), stub };
}

describe("errors", () => {
  test("a rate limit that is too long fails the load, no entry is skipped", async () => {
    const { error } = await fails(NPM, () =>
      json("{}", 429, { "retry-after": String(RegistryLimits.maxRetryWaitSeconds + 1) }),
    );
    expect(error.code).toBe("rate-limited");
    expect(error.message).toBe(
      "The npm registry API rate limit was hit (HTTP 429); retry after 11 seconds.",
    );
  });

  test("a 429 is waited out once, then the load goes on", async () => {
    const sleeper = fakeSleep();
    const stub = stubFetch((url, call) =>
      call === 0 ? json("{}", 429, { "retry-after": "2" }) : registryApis(url),
    );
    const { meta } = await loadRegistryData({ ...NPM, fetch: stub.fetch, sleep: sleeper.sleep });
    expect(sleeper.waits).toEqual([2000]);
    expect(meta.requests).toBe(3);
  });

  test("a server error fails after one retry", async () => {
    const { error, stub } = await fails(MAVEN, () => json("{}", 503));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe("The Maven Central API answered HTTP 503.");
    expect(stub.calls).toHaveLength(2);
  });

  test("a Maven 404 is an error, not a missing entry", async () => {
    const { error } = await fails(MAVEN, () => json("{}", 404));
    expect(error.code).toBe("not-found");
  });

  test("an unexpected status gives fixed text", async () => {
    const { error } = await fails(NPM, () => json("{}", 418));
    expect(error.message).toBe("The npm registry API answered HTTP 418.");
    const forbidden = await fails(NPM, () => json("{}", 403));
    expect(forbidden.error.code).toBe("forbidden");
  });

  test("an oversized answer is refused", async () => {
    const big = await fails({ ...NPM, maxBytes: 1000 }, () => json("x".repeat(2000)));
    expect(big.error.code).toBe("too-large");
    const small = stubFetch(registryApis);
    const tiny = await failure(loadRegistryData({ ...NPM, maxBytes: 10, fetch: small.fetch }));
    expect(tiny.message).toBe("The npm registry answer is larger than 10 bytes.");
  });

  test("a body that is not JSON by type, text or shape is refused", async () => {
    const html = await fails(
      NPM,
      () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    expect(html.error.message).toBe(
      'The npm registry answer has content type "text/html", not JSON.',
    );
    const text = await fails(NPM, () => json("not json at all"));
    expect(text.error.message).toBe("The npm registry answer is not valid JSON.");
    const shape = await fails(NPM, () => json('{"version":42}'));
    expect(shape.error.message).toBe("The npm registry answer version is not a version.");
    const downloads = await fails(NPM, (url) =>
      url.includes("downloads") ? json('{"downloads":-1}') : registryApis(url),
    );
    expect(downloads.error.message).toBe(
      "The npm downloads answer downloads is not a non-negative whole number.",
    );
    const maven = await fails(MAVEN, () =>
      json(
        '{"response":{"numFound":1,"docs":[{"g":"junit","a":"junit","latestVersion":"1","timestamp":"x"}]}}',
      ),
    );
    expect(maven.error.message).toBe("The Maven Central answer timestamp is not a date.");
    const noDocs = await fails(MAVEN, () => json('{"response":{"numFound":1,"docs":3}}'));
    expect(noDocs.error.message).toBe("The Maven Central answer docs is not a list.");
  });

  test("a version with control characters or over 64 characters is refused", async () => {
    for (const bad of ["1.0\n2", "x".repeat(65), ""]) {
      const { error } = await fails(NPM, () => json(JSON.stringify({ version: bad })));
      expect(error.code).toBe("invalid-response");
    }
  });

  test("a redirect fails after one request and never follows", async () => {
    const { error, stub } = await fails(
      NPM,
      () =>
        new Response(null, { status: 301, headers: { location: "https://elsewhere.example/" } }),
    );
    expect(error.message).toBe("The npm registry API redirected; no redirect is followed.");
    expect(stub.calls).toHaveLength(1);
  });

  test("a network error and a timeout give fixed text", async () => {
    const down = await fails(NPM, () => {
      throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
    });
    expect(down.error.code).toBe("network");
    expect(down.error.message).toBe("The npm registry API could not be reached.");
    const stub = stubFetch(() => new Promise<Response>(() => undefined));
    const slow = await failure(
      loadRegistryData({ ...NPM, timeoutMs: 1000, fetch: stub.fetch, signal: AbortSignal.abort() }),
    );
    expect(slow.code).toBe("timeout");
  });

  test("the whole load shares one timeout", async () => {
    const stub = stubFetch(() => new Promise<Response>(() => undefined));
    const started = Date.now();
    const error = await failure(loadRegistryData({ ...NPM, timeoutMs: 1000, fetch: stub.fetch }));
    expect(error.code).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(5000);
    expect(stub.calls).toHaveLength(1);
  });

  test("a foreign error from the stub never leaves its text", async () => {
    const { error } = await fails(NPM, () => {
      throw new TypeError("token=hunter2 failed");
    });
    expect(error.message).not.toContain("hunter2");
  });
});
