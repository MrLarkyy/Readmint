import { request, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { createServer, type Server } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, type ImageFetch, runCli } from "../src/index.js";
import { PreviewServer } from "../src/PreviewServer.js";
import { boundDesign, type CliTree, makeCliTree, png } from "./cliTree.js";

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface Preview {
  readonly port: number;
  stderr(): string;
  /** Aborts the preview and resolves with its exit code. */
  stop(): Promise<number>;
}

let tree: CliTree;
let running: Preview | undefined;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound/design.json", boundDesign());
  await tree.file("bound/logo.png", png);
  await tree.file("data.json", { v: 12 });
});

afterEach(async () => {
  await running?.stop();
  running = undefined;
  await tree.remove();
});

async function startPreview(
  design = "bound/design.json",
  extra: { readonly args?: readonly string[]; readonly fetch?: ImageFetch } = {},
): Promise<Preview> {
  const controller = new AbortController();
  let stderr = "";
  const argv = ["preview", design, "--data", "data.json", "--port", "0", ...(extra.args ?? [])];
  const exit = runCli(argv, {
    ...(extra.fetch === undefined ? {} : { fetch: extra.fetch }),
    stdout: () => undefined,
    stderr: (text) => {
      stderr += text;
    },
    cwd: tree.root,
    signal: controller.signal,
    pollIntervalMs: 20,
  });
  let port: number | undefined;
  await until(() => {
    port = Number(/preview: http:\/\/127\.0\.0\.1:(\d+)\//.exec(stderr)?.[1]);
    return port > 0;
  });
  let stopped: Promise<number> | undefined;
  running = {
    port: port ?? 0,
    stderr: () => stderr,
    stop: () => {
      controller.abort();
      stopped ??= exit;
      return stopped;
    },
  };
  return running;
}

async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the preview");
    await sleep(10);
  }
}

function get(
  port: number,
  path: string,
  options: { method?: string; host?: string | null; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const host = options.host === undefined ? `127.0.0.1:${String(port)}` : options.host;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method ?? "GET",
        // A fresh connection each time: the default agent keeps sockets the preview has closed.
        agent: false,
        setHost: false,
        headers: { ...(host === null ? {} : { host }), ...options.headers },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () => {
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

interface EventStream {
  readonly status: number;
  text(): string;
  readonly ended: Promise<void>;
  close(): void;
}

function events(port: number): Promise<EventStream> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/events",
        agent: false,
        headers: { host: `localhost:${String(port)}` },
      },
      (response: IncomingMessage) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (text += chunk));
        const ended = new Promise<void>((done) => {
          response.on("end", done);
          response.on("close", done);
        });
        resolve({
          status: response.statusCode ?? 0,
          text: () => text,
          ended,
          close: () => {
            req.destroy();
          },
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function status(port: number): Promise<{ version: number; ok: boolean; issues: string[] }> {
  return JSON.parse((await get(port, "/status")).body) as {
    version: number;
    ok: boolean;
    issues: string[];
  };
}

test("PreviewServer listens on 127.0.0.1 only", async () => {
  const server = new PreviewServer();
  try {
    const address = await server.listen(0);
    expect(address.address).toBe("127.0.0.1");
    expect(address.family).toBe("IPv4");
  } finally {
    await server.close();
  }
});

describe("routes", () => {
  test("serves the page, the SVG render exactly, and the status", async () => {
    const { port } = await startPreview();
    const page = await get(port, "/");
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(page.headers["content-security-policy"]).toMatch(
      /^default-src 'none'; script-src 'sha256-/,
    );
    expect(page.body).toContain('<img id="render"');

    const svg = await get(port, "/render.svg?v=1");
    const rendered = await tree.run(["render", "bound/design.json", "--data", "data.json"]);
    expect(svg.status).toBe(200);
    expect(svg.body).toBe(rendered.stdout);
    expect(svg.headers).toMatchObject({
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
      "cross-origin-resource-policy": "same-origin",
    });

    expect(await status(port)).toEqual({ version: 1, ok: true, issues: [] });
  });

  test("HEAD answers headers without a body", async () => {
    const { port } = await startPreview();
    const head = await get(port, "/render.svg", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect(Number(head.headers["content-length"])).toBeGreaterThan(0);
  });

  test.each(["localhost", "LOCALHOST", "127.0.0.1"])(
    "accepts the Host %s with the port",
    async (name) => {
      const { port } = await startPreview();
      expect((await get(port, "/status", { host: `${name}:${String(port)}` })).status).toBe(200);
    },
  );

  test.each([
    "evil.example",
    "evil.example:80",
    "127.0.0.1",
    "localhost",
    "127.0.0.1:1",
    "[::1]",
    "",
  ])("refuses the Host %j (DNS rebinding)", async (host) => {
    const { port } = await startPreview();
    const reply = await get(port, "/render.svg", { host });
    expect(reply.status).toBe(403);
    expect(reply.body).not.toContain("<svg");
  });

  test("refuses a request without a Host header", async () => {
    const { port } = await startPreview();
    // Node answers 400 to an HTTP/1.1 request without Host before the preview sees it.
    expect([400, 403]).toContain((await get(port, "/render.svg", { host: null })).status);
  });

  test.each(["cross-site", "same-site"])("refuses Sec-Fetch-Site %s", async (site) => {
    const { port } = await startPreview();
    const reply = await get(port, "/render.svg", { headers: { "sec-fetch-site": site } });
    expect(reply.status).toBe(403);
    expect(
      (await get(port, "/render.svg", { headers: { "sec-fetch-site": "same-origin" } })).status,
    ).toBe(200);
  });

  test.each([
    "/../render.svg",
    "/x/../status",
    "/%2e%2e/render.svg",
    "/%2E%2E%2Fdata.json",
    "/render.svg/x",
    "//render.svg",
    "//etc/passwd",
    "/data.json",
    "/bound/design.json",
    "/index.html",
    "/RENDER.SVG",
    "http://127.0.0.1/status",
  ])("answers 404 to %s", async (path) => {
    const { port } = await startPreview();
    const reply = await get(port, path);
    expect(reply.status).toBe(404);
    expect(reply.body).toBe("not found\n");
  });

  test.each(["POST", "PUT", "DELETE", "OPTIONS"])("answers 405 to %s", async (method) => {
    const { port } = await startPreview();
    const reply = await get(port, "/", { method });
    expect(reply.status).toBe(405);
    expect(reply.headers.allow).toBe("GET, HEAD");
  });
});

describe("live reload", () => {
  test("an edit of the design reloads once; an identical rewrite does not", async () => {
    const { port } = await startPreview();
    const stream = await events(port);
    expect(stream.status).toBe(200);
    const before = (await get(port, "/render.svg")).body;

    const edited = boundDesign() as { canvas: { width: number } };
    edited.canvas.width = 60;
    await tree.file("bound/design.json", edited);
    await until(async () => (await get(port, "/render.svg")).body !== before);
    await until(() => stream.text().includes("event: reload\ndata: 2\n\n"));
    const after = await get(port, "/render.svg");
    expect(after.body).not.toBe(before);
    expect(after.body).toBe(
      (await tree.run(["render", "bound/design.json", "--data", "data.json"])).stdout,
    );
    expect((await status(port)).version).toBe(2);

    await tree.file("bound/design.json", edited);
    await sleep(200);
    expect((await status(port)).version).toBe(2);
    expect(stream.text()).not.toContain("data: 3");
    stream.close();
  });

  test("an edit of the fixture data or an asset reloads", async () => {
    const { port } = await startPreview();
    const before = (await get(port, "/render.svg")).body;
    await tree.file("data.json", { v: 20 });
    await until(async () => (await status(port)).version === 2);
    expect((await get(port, "/render.svg")).body).not.toBe(before);
    await tree.file("bound/logo.png", "not an image");
    await until(async () => (await status(port)).version === 3);
    const current = await status(port);
    expect(current.ok).toBe(false);
    expect(current.issues.join("\n")).toContain("error asset-format at /assets/images/logo");
  });

  test("a broken edit keeps the last SVG and shows the issues; fixing it renders again", async () => {
    const { port } = await startPreview();
    const good = (await get(port, "/render.svg")).body;
    await tree.file("bound/design.json", '{ "version": 0, \u202e');
    await until(async () => (await status(port)).version === 2);
    const broken = await status(port);
    expect(broken.ok).toBe(false);
    expect(broken.issues[0]).toMatch(/^bound\/design\.json:1:\d+: error parse at \/: /);
    expect(broken.issues.join("")).not.toContain("\u202e");
    expect((await get(port, "/render.svg")).body).toBe(good);

    await tree.file("bound/design.json", boundDesign());
    await until(async () => (await status(port)).version === 3);
    expect(await status(port)).toEqual({ version: 3, ok: true, issues: [] });
  });

  test("a missing asset that appears later is picked up", async () => {
    await tree.file("late/design.json", boundDesign());
    const { port } = await startPreview("late/design.json");
    const first = await status(port);
    expect(first.ok).toBe(false);
    expect((await get(port, "/render.svg")).status).toBe(503);
    await tree.file("late/logo.png", png);
    await until(async () => (await status(port)).ok);
    expect((await get(port, "/render.svg")).status).toBe(200);
  });
});

describe("resources", () => {
  test("a ninth event stream is refused with 503", async () => {
    const { port } = await startPreview();
    const streams = await Promise.all(Array.from({ length: 8 }, () => events(port)));
    expect(streams.map((stream) => stream.status)).toEqual(Array<number>(8).fill(200));
    expect((await get(port, "/events")).status).toBe(503);
    streams[0]?.close();
    await until(async () => (await get(port, "/events", { method: "HEAD" })).status === 200);
    for (const stream of streams) stream.close();
  });

  test("a port in use is exit code 3", async () => {
    const blocker: Server = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const address = blocker.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    try {
      const run = await tree.run(["preview", "bound/design.json", "--port", String(port)]);
      expect(run).toMatchObject({
        code: ExitCode.input,
        stderr: `port ${String(port)} is already in use; pass another --port\n`,
      });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  test("abort ends with exit code 0, closes the event streams and the port", async () => {
    const servers = () =>
      process.getActiveResourcesInfo().filter((name) => name === "TCPServerWrap").length;
    const before = servers();
    const preview = await startPreview();
    const stream = await events(preview.port);
    expect(await preview.stop()).toBe(ExitCode.ok);
    running = undefined;
    await stream.ended;
    await expect(get(preview.port, "/status")).rejects.toMatchObject({ code: "ECONNREFUSED" });
    // libuv releases a closed handle on a later turn of the loop.
    await until(() => servers() === before, 2000);
  });
});

test("--fetch-images serves the bound image inlined (RM-28)", async () => {
  const avatar = "https://avatars.githubusercontent.com/u/1?v=4";
  await tree.file("avatar.json", {
    version: 0,
    canvas: { width: 20, height: 20 },
    assets: { images: { avatar: { src: "{{ github.avatarUrl }}" } } },
    layers: [{ type: "image", asset: "avatar", width: 16, height: 16 }],
  });
  await tree.file("data.json", { github: { avatarUrl: avatar } });
  const urls: string[] = [];
  const { port } = await startPreview("avatar.json", {
    args: ["--fetch-images"],
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve(new Response(new Uint8Array(png), { status: 200 }));
    },
  });
  const svg = await get(port, "/render.svg");
  expect(svg.status).toBe(200);
  expect(svg.body).toContain('href="data:image/png;base64,');
  expect(svg.body).not.toContain("https:");
  expect(urls).toEqual([avatar]);
});
