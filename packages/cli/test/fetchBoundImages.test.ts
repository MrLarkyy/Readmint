import type { Design } from "@readmint/format";
import { RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import {
  defaultImageHosts,
  fetchBoundImages,
  type ImageFetch,
  RemoteImageError,
  RemoteImageLimits,
  type RemoteImageOptions,
} from "../src/index.js";
import { png } from "./cliTree.js";

const avatar = "https://avatars.githubusercontent.com/u/1?v=4";
const pngBytes = new Uint8Array(png);

function design(images: Readonly<Record<string, string>> = { avatar: "{{ github.avatarUrl }}" }) {
  const ids = Object.keys(images);
  return {
    version: 0,
    canvas: { width: 10, height: 10 },
    assets: { images: Object.fromEntries(ids.map((id) => [id, { src: images[id] ?? "" }])) },
    layers: ids.map((id) => ({ type: "image", asset: id, width: 8, height: 8 })),
  } as Design;
}

const github = (avatarUrl: unknown) => ({ github: { avatarUrl } });

/** A recorded response: the bytes, status and headers a fake host answers with. */
function answer(
  body: ConstructorParameters<typeof Response>[0],
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(body, { status, headers: { "content-type": "image/png", ...headers } });
}

interface Recorded {
  readonly calls: { readonly url: string; readonly init: RequestInit }[];
  readonly fetch: ImageFetch;
}

function host(reply: (url: string, init: RequestInit) => Response | Promise<Response>): Recorded {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return reply(url, init);
    },
  };
}

const options = (fetch: ImageFetch, extra: Partial<RemoteImageOptions> = {}) => ({
  fetch,
  cache: new Map(),
  ...extra,
});

async function refusal(promise: Promise<unknown>): Promise<RemoteImageError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof RemoteImageError)) throw new Error(`expected a RemoteImageError`);
  return error;
}

function pngHeader(width: number, height: number): Uint8Array {
  const u32 = (value: number) => [
    value >>> 24,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ];
  const ascii = (text: string) => Array.from({ length: text.length }, (_, i) => text.charCodeAt(i));
  return new Uint8Array([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...u32(13),
    ...ascii("IHDR"),
    ...u32(width),
    ...u32(height),
    ...[8, 6, 0, 0, 0],
    ...u32(0),
    ...u32(0),
    ...ascii("IDAT"),
  ]);
}

describe("fetchBoundImages", () => {
  test("fetches the bound URL and returns its bytes under the asset id", async () => {
    const recorded = host(() => answer(pngBytes));
    const images = await fetchBoundImages(design(), github(avatar), options(recorded.fetch));
    expect(Object.keys(images)).toEqual(["avatar"]);
    expect(images.avatar).toEqual(pngBytes);
    expect(recorded.calls.map((call) => call.url)).toEqual([avatar]);
  });

  test("the request is exactly a GET for an image: no credential, no cookie, no redirect", async () => {
    const recorded = host(() => answer(pngBytes));
    await fetchBoundImages(design(), github(avatar), options(recorded.fetch));
    const [call] = recorded.calls;
    expect(call?.init).toEqual({
      method: "GET",
      headers: { accept: "image/png,image/jpeg,image/gif,image/webp" },
      redirect: "error",
      credentials: "omit",
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(Object.keys(call?.init ?? {}).sort()).toEqual([
      "credentials",
      "headers",
      "method",
      "redirect",
      "signal",
    ]);
  });

  test("assets without a binding are left alone", async () => {
    const recorded = host(() => answer(pngBytes));
    const images = await fetchBoundImages(
      design({ logo: "logo.png", inline: "data:image/png;base64,AAAA" }),
      github(avatar),
      options(recorded.fetch),
    );
    expect(images).toEqual({});
    expect(recorded.calls).toEqual([]);
  });

  test("a URL is fetched once per cache, across assets and designs", async () => {
    const recorded = host(() => answer(pngBytes));
    const shared = options(recorded.fetch);
    const twice = design({ a: "{{ github.avatarUrl }}", b: "{{ github.avatarUrl }}" });
    const first = await fetchBoundImages(twice, github(avatar), shared);
    const second = await fetchBoundImages(design(), github(avatar), shared);
    expect(recorded.calls).toHaveLength(1);
    expect(first.a).toBe(first.b);
    expect(second.avatar).toBe(first.a);
  });

  test("the URL host is compared as URL normalises it", async () => {
    const recorded = host(() => answer(pngBytes));
    const upper = "https://AVATARS.githubusercontent.com/u/1";
    await fetchBoundImages(design(), github(upper), options(recorded.fetch));
    expect(recorded.calls.map((call) => call.url)).toEqual([
      "https://avatars.githubusercontent.com/u/1",
    ]);
  });

  test.each([
    ["http", "http://avatars.githubusercontent.com/u/1", "image-url"],
    ["no URL", "avatars.githubusercontent.com/u/1", "image-url"],
    ["user info", "https://user:pw@avatars.githubusercontent.com/u/1", "image-url"],
    ["a port", "https://avatars.githubusercontent.com:8443/u/1", "image-url"],
    ["too long", `${avatar}&p=${"a".repeat(2048)}`, "image-url"],
    ["another host", "https://example.com/a.png", "image-host"],
    ["a suffix host", "https://avatars.githubusercontent.com.evil.example/u/1", "image-host"],
    ["a trailing dot", "https://avatars.githubusercontent.com./u/1", "image-host"],
    ["the host in the query", "https://evil.example/?avatars.githubusercontent.com", "image-host"],
    ["a sub-domain", "https://x.avatars.githubusercontent.com/u/1", "image-host"],
  ])("refuses %s before any request", async (_name, url, code) => {
    const recorded = host(() => answer(pngBytes));
    const error = await refusal(fetchBoundImages(design(), github(url), options(recorded.fetch)));
    expect(error).toMatchObject({ code, asset: "avatar" });
    expect(recorded.calls).toEqual([]);
  });

  test("the allow-list is exactly defaultImageHosts unless given", async () => {
    expect(defaultImageHosts).toEqual(["avatars.githubusercontent.com"]);
    const recorded = host(() => answer(pngBytes));
    const other = "https://img.example/a.png";
    const images = await fetchBoundImages(
      design(),
      github(other),
      options(recorded.fetch, { allowedHosts: ["img.example"] }),
    );
    expect(images.avatar).toEqual(pngBytes);
  });

  test("a host refusal names the asset and the URL, escaped", async () => {
    const recorded = host(() => answer(pngBytes));
    const error = await refusal(
      fetchBoundImages(design(), github("https://evil.example/‮"), options(recorded.fetch)),
    );
    expect(error.message).toBe(
      'image asset "avatar": "https://evil.example/\\u202e": host "evil.example" is not allowed (allowed: avatars.githubusercontent.com)',
    );
  });

  test.each([
    ["a number", { github: { avatarUrl: 4 } }, "gives a number, not a URL"],
    ["a missing path", { github: {} }, "gives null, not a URL"],
    ["a missing namespace", {}, ""],
  ])("refuses a binding that gives %s", async (_name, data, text) => {
    const error = await refusal(
      fetchBoundImages(design(), data, options(host(() => answer(pngBytes)).fetch)),
    );
    expect(error.code).toBe("image-binding");
    expect(error.message).toContain(text);
  });

  test("refuses a binding when there is no data", async () => {
    const error = await refusal(
      fetchBoundImages(design(), undefined, options(host(() => answer(pngBytes)).fetch)),
    );
    expect(error).toMatchObject({ code: "image-binding", asset: "avatar" });
  });

  test("refuses a declared content-length over the cap without reading the body", async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true;
          controller.enqueue(pngBytes);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const recorded = host(() =>
      answer(body, 200, { "content-length": String(RenderLimits.maxImageBytes + 1) }),
    );
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch)),
    );
    expect(error.code).toBe("image-too-large");
    expect(pulled).toBe(false);
  });

  test("refuses a streamed body over the cap without a content-length", async () => {
    const chunk = new Uint8Array(1_048_576);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++;
        if (sent > 8) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const recorded = host(() => new Response(body, { status: 200 }));
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch)),
    );
    expect(error.code).toBe("image-too-large");
    expect(sent).toBeLessThanOrEqual(6);
  });

  test("refuses an image wider than the renderer takes", async () => {
    const recorded = host(() => answer(pngHeader(9000, 9000)));
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch)),
    );
    expect(error.code).toBe("image-too-large");
    expect(error.message).toContain("9000x9000");
  });

  test("refuses a body that is no image, whatever its content-type", async () => {
    const recorded = host(() => answer("<!doctype html><title>x</title>"));
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch)),
    );
    expect(error.code).toBe("image-format");
  });

  test("refuses an SVG body", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>';
    const recorded = host(() => answer(svg, 200, { "content-type": "image/svg+xml" }));
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch)),
    );
    expect(error.code).toBe("image-format");
  });

  test("a non-2xx answer is image-fetch with the status", async () => {
    const recorded = host(() => answer("gone", 404));
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch)),
    );
    expect(error).toMatchObject({ code: "image-fetch", asset: "avatar" });
    expect(error.message).toBe(`image asset "avatar": "${avatar}": the host answered 404`);
  });

  test("a redirect answer is refused, never followed", async () => {
    const recorded = host(() => answer(null, 302, { location: "https://evil.example/a.png" }));
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch)),
    );
    expect(error.code).toBe("image-fetch");
    expect(recorded.calls).toHaveLength(1);
  });

  test("a rejected fetch (network error, refused redirect) does not echo its text", async () => {
    const recorded = host(() => Promise.reject(new TypeError("fetch failed: secret detail")));
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch)),
    );
    expect(error.code).toBe("image-fetch");
    expect(error.message).not.toContain("secret");
  });

  test("a host that does not answer in time is image-fetch", async () => {
    const recorded = host(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch, { timeoutMs: 20 })),
    );
    expect(error.code).toBe("image-fetch");
    expect(error.message).toContain("no answer within 20 ms");
  });

  test("the signal stops a request that never answers", async () => {
    const stop = new AbortController();
    const recorded = host(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
          stop.abort();
        }),
    );
    const error = await refusal(
      fetchBoundImages(design(), github(avatar), options(recorded.fetch, { signal: stop.signal })),
    );
    expect(error.code).toBe("image-fetch");
    expect(error.message).toContain("the request was stopped");
    expect(recorded.calls[0]?.init.signal?.aborted).toBe(true);
  });

  test("a failed URL fails every design that binds it the same way, fetched once", async () => {
    const recorded = host(() => answer("gone", 404));
    const shared = options(recorded.fetch);
    const first = await refusal(fetchBoundImages(design(), github(avatar), shared));
    const second = await refusal(fetchBoundImages(design(), github(avatar), shared));
    expect(second.message).toBe(first.message);
    expect(recorded.calls).toHaveLength(1);
  });

  test(`at most ${String(RemoteImageLimits.maxUrls)} distinct URLs are fetched per cache`, async () => {
    const max = RemoteImageLimits.maxUrls;
    const ids = Array.from({ length: max + 1 }, (_, index) => `a${String(index).padStart(2, "0")}`);
    const many = design(Object.fromEntries(ids.map((id) => [id, `{{ urls.${id} }}`])));
    const urls = Object.fromEntries(ids.map((id) => [id, `${avatar}&id=${id}`]));
    const recorded = host(() => answer(pngBytes));
    const error = await refusal(fetchBoundImages(many, { urls }, options(recorded.fetch)));
    expect(error).toMatchObject({ code: "image-fetch", asset: ids[max] });
    expect(recorded.calls).toHaveLength(max);
  });
});
