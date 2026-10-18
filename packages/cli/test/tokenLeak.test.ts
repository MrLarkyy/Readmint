import { request } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { wakaTimeSecretForms } from "@readmint/data-wakatime";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, type ImageFetch, runCli } from "../src/index.js";
import { boundDesign, type CliRun, type CliTree, makeCliTree, png } from "./cliTree.js";
import { CANARY, echoing, githubReplay, secretForms } from "./githubFetch.js";

const env = { GH_TOKEN: CANARY };
let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound/design.json", boundDesign("{{ github.following }}"));
  await tree.file("bound/logo.png", png);
  await tree.file("broken/design.json", boundDesign("{{ github.nothing.here }}"));
  await tree.file("broken/logo.png", png);
  await tree.file("avatar.json", {
    version: 0,
    canvas: { width: 40, height: 24 },
    assets: { images: { avatar: { src: "{{ github.avatarUrl }}" } } },
    layers: [{ type: "image", asset: "avatar", x: 4, y: 4, width: 16, height: 16 }],
  });
});

afterEach(async () => {
  await tree.remove();
});

function expectNoToken(run: CliRun): void {
  for (const form of secretForms(CANARY)) {
    expect(run.stdout).not.toContain(form);
    expect(run.stderr).not.toContain(form);
  }
}

describe("the token from the environment is never printed", () => {
  test("on success", async () => {
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env,
      fetch: githubReplay().fetch,
    });
    expect(run.code).toBe(ExitCode.ok);
    expectNoToken(run);
  });

  test.each([
    ["401", 401, "unauthorized"],
    ["500", 500, "http"],
  ])("when GitHub answers %s echoing the Authorization header", async (_name, status, code) => {
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env,
      fetch: githubReplay(echoing(status)).fetch,
    });
    expect(run.code).toBe(ExitCode.data);
    expect(run.stderr).toContain(`GitHub data (${code}): `);
    expectNoToken(run);
  });

  test("when the network fails with the token in the error", async () => {
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env,
      fetch: githubReplay(() => Promise.reject(new TypeError(`fetch failed for token ${CANARY}`)))
        .fetch,
    });
    expect(run.code).toBe(ExitCode.data);
    expect(run.stderr).toContain("GitHub data (network): ");
    expectNoToken(run);
  });

  test("when the design fails to render", async () => {
    const run = await tree.run(["render", "broken/design.json", "--github"], {
      env,
      fetch: githubReplay().fetch,
    });
    expect(run.code).toBe(ExitCode.invalid);
    expectNoToken(run);
  });

  test("on a usage error", async () => {
    const run = await tree.run(["render", "bound/design.json", "--github", "--colour"], { env });
    expect(run.code).toBe(ExitCode.usage);
    expectNoToken(run);
  });

  test("on an internal error whose message holds the token in every form", async () => {
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env,
      fetch: githubReplay().fetch,
      stdout: () => {
        throw new Error(`broken ${secretForms(CANARY).join(" ")}`);
      },
    });
    expect(run.code).toBe(ExitCode.internal);
    expect(run.stderr).toContain("internal error: broken *** *** ***");
    expectNoToken(run);
  });

  test("on an internal error without --github", async () => {
    const run = await tree.run(["validate", "bound/design.json"], {
      env: { GITHUB_TOKEN: CANARY },
      stdout: () => {
        throw new Error(`broken ${CANARY}`);
      },
    });
    expect(run.code).toBe(ExitCode.internal);
    expectNoToken(run);
  });
});

describe("a token given as an argument", () => {
  test.each([
    [["render", "bound/design.json", "--token", CANARY]],
    [["render", "bound/design.json", `--token=${CANARY}`]],
    [["render", "bound/design.json", "--github", CANARY]],
    [["render", CANARY]],
    [[CANARY, "bound/design.json"]],
    [["render", "bound/design.json", "--github", "--login", CANARY]],
    [["render", "bound/design.json", `--data=${CANARY}`]],
  ])("%#: is a usage error that does not print it", async (argv) => {
    const run = await tree.run(argv);
    expect(run.code).toBe(ExitCode.usage);
    expect(run.stderr).toContain("GH_TOKEN or GITHUB_TOKEN");
    expectNoToken(run);
  });
});

test("--github --fetch-images sends no credential with an image request", async () => {
  const replay = githubReplay();
  const fetch: ImageFetch = replay.fetch;
  const run = await tree.run(["render", "avatar.json", "--github", "--fetch-images"], {
    env,
    fetch,
  });
  expect(run).toMatchObject({ code: ExitCode.ok, stderr: "" });
  const images = replay.requests.filter((sent) => sent.operation === undefined);
  expect(images.map((sent) => sent.url)).toEqual(["https://avatars.githubusercontent.com/u/1?v=4"]);
  for (const sent of images) {
    expect(new Headers(sent.init.headers).has("authorization")).toBe(false);
    expect(sent.init.credentials).toBe("omit");
    const init = JSON.stringify({ ...sent.init, headers: [...new Headers(sent.init.headers)] });
    for (const form of secretForms(CANARY)) {
      expect(init).not.toContain(form);
      expect(sent.url).not.toContain(form);
    }
  }
  expectNoToken(run);
});

function previewStatus(port: number, secret: string): Promise<{ ok: boolean; issues: string[] }> {
  return new Promise((resolve, reject) => {
    const path = `/${secret}/status`;
    const req = request({ host: "127.0.0.1", port, path, agent: false }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => (body += chunk));
      response.on("end", () => {
        resolve(JSON.parse(body) as { ok: boolean; issues: string[] });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("the preview page's issues never show the token", async () => {
  await tree.file("leaky.json", {
    version: 0,
    canvas: { width: 40, height: 24 },
    assets: { images: { leak: { src: `http://example.com/${CANARY}.png` } } },
    layers: [{ type: "image", asset: "leak", x: 4, y: 4, width: 16, height: 16 }],
  });
  const controller = new AbortController();
  let stderr = "";
  const exit = runCli(["preview", "leaky.json", "--github", "--fetch-images", "--port", "0"], {
    stdout: () => undefined,
    stderr: (text) => {
      stderr += text;
    },
    cwd: tree.root,
    signal: controller.signal,
    pollIntervalMs: 20,
    env,
    fetch: githubReplay().fetch,
  });
  try {
    const deadline = Date.now() + 10_000;
    let printed: RegExpExecArray | null = null;
    let issues: string[] = [];
    while (issues.length === 0) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the preview");
      printed ??= /preview: http:\/\/127\.0\.0\.1:(\d+)\/([A-Za-z0-9_-]{43})\/\n/.exec(stderr);
      if (printed !== null)
        ({ issues } = await previewStatus(Number(printed[1]), printed[2] ?? ""));
      await sleep(10);
    }
    const page = JSON.stringify(issues);
    expect(page).toContain("***");
    for (const form of secretForms(CANARY)) expect(page).not.toContain(form);
  } finally {
    controller.abort();
  }
  expect(await exit).toBe(ExitCode.ok);
  expectNoToken({ code: 0, stdout: "", stderr });
});

describe("a failing --open opener never leaks the secret address", () => {
  async function previewWith(openUrl: (url: string) => Promise<void>) {
    const controller = new AbortController();
    let stderr = "";
    const exit = runCli(["preview", "bound/design.json", "--github", "--open", "--port", "0"], {
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
      cwd: tree.root,
      signal: controller.signal,
      pollIntervalMs: 20,
      env,
      fetch: githubReplay().fetch,
      openUrl,
    });
    const deadline = Date.now() + 10_000;
    while (!stderr.includes("cannot open a browser")) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the opener line");
      await sleep(10);
    }
    controller.abort();
    return { code: await exit, stderr };
  }

  /** The opener got the launch address, and neither it nor a second secret reached standard error. */
  function expectOnlyThePreviewLine(stderr: string, line: string, seen: string): void {
    const printed = printedAddress(stderr);
    expectLaunchAddress(seen, printed);
    expect(stderr.split(printed.secret)).toHaveLength(2);
    expect(stderr).not.toContain(seen.slice(-43));
    expect(stderr).toContain(line);
    expect(stderr).not.toContain("internal error");
  }

  test("a rejection with the address in its message, path and arguments", async () => {
    let seen = "";
    const { code, stderr } = await previewWith((url) => {
      seen = url;
      return Promise.reject(
        Object.assign(new Error(`spawn xdg-open ENOENT ${url}`), {
          code: "ENOENT",
          path: url,
          spawnargs: [url],
        }),
      );
    });
    expect(code).toBe(ExitCode.ok);
    expectOnlyThePreviewLine(
      stderr,
      "preview: cannot open a browser (ENOENT); open the address above\n",
      seen,
    );
    expectNoToken({ code, stdout: "", stderr });
  });

  test("a synchronous throw with the address as its code", async () => {
    let seen = "";
    const { code, stderr } = await previewWith((url) => {
      seen = url;
      throw Object.assign(new Error(`boom ${url}`), { code: url });
    });
    expect(code).toBe(ExitCode.ok);
    expectOnlyThePreviewLine(
      stderr,
      "preview: cannot open a browser; open the address above\n",
      seen,
    );
  });
});

/** The port and the secret of the one `preview:` line of a `--github` run. */
function printedAddress(stderr: string): { port: string; secret: string } {
  const printed = /preview: http:\/\/127\.0\.0\.1:(\d+)\/([A-Za-z0-9_-]{43})\/\n/.exec(stderr);
  expect(printed).not.toBeNull();
  return { port: printed?.[1] ?? "", secret: printed?.[2] ?? "" };
}

/** What the opener got: the launch address of that server, never the secret. */
function expectLaunchAddress(seen: string, printed: { port: string; secret: string }): void {
  expect(seen).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{43}$/);
  expect(seen.startsWith(`http://127.0.0.1:${printed.port}/`)).toBe(true);
  expect(seen).not.toContain(printed.secret);
}

function getRaw(url: string): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { agent: false }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => (body += chunk));
      response.on("end", () => {
        const location = response.headers.location;
        resolve({
          status: response.statusCode ?? 0,
          ...(location === undefined ? {} : { location }),
          body,
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("--github --open opens a one-time launch address, never the secret one", async () => {
  const controller = new AbortController();
  let stderr = "";
  let seen = "";
  const exit = runCli(["preview", "bound/design.json", "--github", "--open", "--port", "0"], {
    stdout: () => undefined,
    stderr: (text) => {
      stderr += text;
    },
    cwd: tree.root,
    signal: controller.signal,
    pollIntervalMs: 20,
    env,
    fetch: githubReplay().fetch,
    openUrl: (url) => {
      seen = url;
      return Promise.resolve();
    },
  });
  try {
    const deadline = Date.now() + 10_000;
    while (seen === "") {
      if (Date.now() > deadline) throw new Error("timed out waiting for the opener");
      await sleep(10);
    }
    const printed = printedAddress(stderr);
    expectLaunchAddress(seen, printed);
    const before = stderr;

    const first = await getRaw(seen);
    expect(first.status).toBe(303);
    expect(first.location).toBe(`/${printed.secret}/`);
    expect(first.body).not.toContain(printed.secret);
    expect((await getRaw(`${new URL(seen).origin}${first.location ?? ""}`)).status).toBe(200);
    const again = await getRaw(seen);
    expect(again.status).toBe(403);
    expect(again.body).toBe("forbidden: open the address the preview printed\n");

    const warning = "preview: the one-time launch address was used again;";
    const warned = Date.now() + 10_000;
    while (!stderr.includes(warning)) {
      if (Date.now() > warned) throw new Error("timed out waiting for the reuse warning");
      await sleep(10);
    }
    expect(stderr.startsWith(before)).toBe(true);
    expect(stderr.slice(before.length)).toMatch(
      /^preview: the one-time launch address was used again; [^\n]*\n$/,
    );
    expect(stderr.split(printed.secret)).toHaveLength(2);
    expect(stderr).not.toContain(seen.slice(-43));

    expect((await getRaw(seen)).status).toBe(403);
    await sleep(100);
    expect(stderr.split(warning)).toHaveLength(2);
  } finally {
    controller.abort();
  }
  expect(await exit).toBe(ExitCode.ok);
  expectNoToken({ code: 0, stdout: "", stderr });
});

test("the preview page and standard error never show a --data-json-header value", async () => {
  const value = "hdrCANARY-rm106-value";
  await tree.file("json/design.json", boundDesign("{{ api.document.h }}"));
  await tree.file("json/logo.png", png);
  const controller = new AbortController();
  let stderr = "";
  const exit = runCli(
    [
      "preview",
      "json/design.json",
      "--data-json",
      "api=https://api.example/stats",
      "--data-json-header",
      "api:X-Api-Key=API_KEY",
      "--port",
      "0",
    ],
    {
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
      cwd: tree.root,
      signal: controller.signal,
      pollIntervalMs: 20,
      env: { API_KEY: value },
      fetch: () =>
        Promise.resolve(
          new Response(`{"h":"${value}"}`, { headers: { "content-type": "application/json" } }),
        ),
    },
  );
  try {
    const deadline = Date.now() + 10_000;
    let printed: RegExpExecArray | null = null;
    let issues: string[] = [];
    while (issues.length === 0) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the preview");
      printed ??= /preview: http:\/\/127\.0\.0\.1:(\d+)\/([A-Za-z0-9_-]{43})\/\n/.exec(stderr);
      if (printed !== null)
        ({ issues } = await previewStatus(Number(printed[1]), printed[2] ?? ""));
      await sleep(10);
    }
    const page = JSON.stringify(issues);
    expect(page).toContain("***");
    expect(page).not.toContain(value);
  } finally {
    controller.abort();
  }
  expect(await exit).toBe(ExitCode.ok);
  expect(stderr).not.toContain(value);
});

test("standard error never shows a --data-feed URL or its key", async () => {
  const key = "feedKEY-rm107-canary";
  const url = `https://feeds.example/private.xml?key=${key}`;
  const answers: ImageFetch[] = [
    () => Promise.resolve(new Response("", { status: 401 })),
    () => Promise.reject(new TypeError(`connect ECONNREFUSED ${url}`)),
    () =>
      Promise.resolve(
        new Response(`<rss><channel><title>${url}</title></rss>`, {
          headers: { "content-type": "application/rss+xml" },
        }),
      ),
    () =>
      Promise.resolve(new Response(`<p>${url}</p>`, { headers: { "content-type": "text/html" } })),
  ];
  for (const fetch of answers) {
    for (const command of ["render", "validate"]) {
      const run = await tree.run([command, "bound/design.json", "--data-feed", url], {
        env,
        fetch,
      });
      expect(run.code).toBe(ExitCode.data);
      expect(run.stderr).toMatch(/^Feed data feed \(/);
      expect(run.stderr).not.toContain(key);
      expect(run.stderr).not.toContain("feeds.example");
      expectNoToken(run);
    }
  }
});

test("the preview page and standard error never show a --data-wakatime key in any form", async () => {
  const key = "waka_LEAK00rm158-0000-4000-8000-c4n4ryk3y000";
  const forms = wakaTimeSecretForms(key);
  await tree.file("waka/design.json", boundDesign("{{ wakatime.languages[0].name }}"));
  await tree.file("waka/logo.png", png);
  const controller = new AbortController();
  let stderr = "";
  const exit = runCli(
    ["preview", "waka/design.json", "--data-wakatime", "WAKATIME_API_KEY", "--port", "0"],
    {
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
      cwd: tree.root,
      signal: controller.signal,
      pollIntervalMs: 20,
      env: { WAKATIME_API_KEY: key },
      // An upstream that echoes the header it got into a language name.
      fetch: (_url, init) =>
        Promise.resolve(
          Response.json({
            data: {
              total_seconds: 1,
              daily_average: 1,
              languages: [
                {
                  name: `${key} ${new Headers(init.headers).get("authorization") ?? ""}`,
                  total_seconds: 1,
                  percent: 100,
                },
              ],
            },
          }),
        ),
    },
  );
  try {
    const deadline = Date.now() + 10_000;
    let printed: RegExpExecArray | null = null;
    let issues: string[] = [];
    while (issues.length === 0) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the preview");
      printed ??= /preview: http:\/\/127\.0\.0\.1:(\d+)\/([A-Za-z0-9_-]{43})\/\n/.exec(stderr);
      if (printed !== null)
        ({ issues } = await previewStatus(Number(printed[1]), printed[2] ?? ""));
      await sleep(10);
    }
    const page = JSON.stringify(issues);
    expect(page).toContain("***");
    for (const form of forms) expect(page).not.toContain(form);
  } finally {
    controller.abort();
  }
  expect(await exit).toBe(ExitCode.ok);
  for (const form of forms) expect(stderr).not.toContain(form);
});

test("standard error never shows a --data-wakatime key, whatever fails", async () => {
  const key = "waka_ERR000rm158-0000-4000-8000-c4n4ryk3y000";
  const echo =
    (status: number, type = "application/json"): ImageFetch =>
    (_url, init) =>
      Promise.resolve(
        new Response(`{"error":"${key} ${new Headers(init.headers).get("authorization") ?? ""}"}`, {
          status,
          headers: { "content-type": type },
        }),
      );
  const answers: ImageFetch[] = [
    echo(401),
    echo(200, "text/html"),
    echo(200),
    () => Promise.reject(new TypeError(`connect ECONNREFUSED ${key}`)),
  ];
  for (const fetch of answers) {
    for (const command of ["render", "validate"]) {
      const run = await tree.run(
        [command, "bound/design.json", "--data-wakatime", "WAKATIME_API_KEY"],
        { env: { ...env, WAKATIME_API_KEY: key }, fetch },
      );
      expect(run.code).toBe(ExitCode.data);
      expect(run.stderr).toMatch(/^WakaTime data wakatime \(/);
      for (const form of wakaTimeSecretForms(key)) {
        expect(run.stderr).not.toContain(form);
        expect(run.stdout).not.toContain(form);
      }
      expectNoToken(run);
    }
  }
});
