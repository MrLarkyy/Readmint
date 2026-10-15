import { request } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
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

function previewStatus(port: number): Promise<{ ok: boolean; issues: string[] }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/status", agent: false }, (response) => {
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
    let port = 0;
    let issues: string[] = [];
    while (issues.length === 0) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the preview");
      port ||= Number(/preview: http:\/\/127\.0\.0\.1:(\d+)\//.exec(stderr)?.[1] ?? 0);
      if (port > 0) ({ issues } = await previewStatus(port));
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
