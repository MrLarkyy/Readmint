import { request } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { loadGitHubData } from "@readmint/data-github";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CliError, ExitCode, loadLiveData, runCli } from "../src/index.js";
import { liveData } from "../src/liveData.js";
import { boundDesign, type CliTree, makeCliTree, png } from "./cliTree.js";
import { CANARY, echoing, githubReplay } from "./githubFetch.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound/design.json", boundDesign("{{ github.following }}"));
  await tree.file("bound/logo.png", png);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await tree.remove();
});

describe("render and validate --github", () => {
  test("render --github writes the bytes render --data writes with the same { github } object", async () => {
    const replay = githubReplay();
    const live = await tree.run(["render", "bound/design.json", "--github"], {
      env: { GH_TOKEN: CANARY },
      fetch: replay.fetch,
    });
    const { data } = await loadGitHubData({ token: CANARY, fetch: githubReplay().fetch });
    await tree.file("github.json", { github: data });
    const fixture = await tree.run(["render", "bound/design.json", "--data", "github.json"]);
    expect(live).toMatchObject({ code: ExitCode.ok, stderr: "" });
    expect(live.stdout).toMatch(/^<svg /);
    expect(live.stdout).toBe(fixture.stdout);
    expect(replay.graphql().map((sent) => sent.operation)).toEqual([
      "ReadmintViewer",
      "ReadmintProfile",
      "ReadmintRepositories",
    ]);
  });

  test("GH_TOKEN wins over GITHUB_TOKEN, and only the Authorization header carries it", async () => {
    const replay = githubReplay();
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env: { GH_TOKEN: `  ${CANARY}\n`, GITHUB_TOKEN: "ghs_otherTOKENotherTOKEN" },
      fetch: replay.fetch,
    });
    expect(run.code).toBe(ExitCode.ok);
    for (const sent of replay.graphql()) {
      expect(new Headers(sent.init.headers).get("authorization")).toBe(`bearer ${CANARY}`);
      expect(sent.url).not.toContain(CANARY);
      expect(sent.init.body).not.toContain(CANARY);
    }
  });

  test("GITHUB_TOKEN is used when GH_TOKEN is empty", async () => {
    const replay = githubReplay();
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env: { GH_TOKEN: " ", GITHUB_TOKEN: CANARY },
      fetch: replay.fetch,
    });
    expect(run.code).toBe(ExitCode.ok);
    const [first] = replay.graphql();
    expect(new Headers(first?.init.headers).get("authorization")).toBe(`bearer ${CANARY}`);
  });

  test("--login reaches the request variables and skips the viewer request", async () => {
    const replay = githubReplay();
    const run = await tree.run(
      ["render", "bound/design.json", "--github", "--login", "readmint-fixture"],
      { env: { GH_TOKEN: CANARY }, fetch: replay.fetch },
    );
    expect(run.code).toBe(ExitCode.ok);
    const sent = replay.graphql();
    expect(sent.map((request) => request.operation)).toEqual([
      "ReadmintProfile",
      "ReadmintRepositories",
    ]);
    for (const request of sent) expect(request.variables?.["login"]).toBe("readmint-fixture");
  });

  test("validate --github renders with the live data", async () => {
    const replay = githubReplay();
    const run = await tree.run(["validate", "bound/design.json", "--github"], {
      env: { GITHUB_TOKEN: CANARY },
      fetch: replay.fetch,
    });
    expect(run).toMatchObject({
      code: ExitCode.ok,
      stdout: "bound/design.json: ok\n",
      stderr: "",
    });
    expect(replay.graphql().length).toBeGreaterThan(0);
  });

  test.each([[{}], [{ GH_TOKEN: "", GITHUB_TOKEN: "  " }], [undefined]])(
    "without a token (%j) --github exits with 4, names both variables and sends nothing",
    async (env) => {
      const replay = githubReplay();
      const global = vi.spyOn(globalThis, "fetch");
      const run = await tree.run(["render", "bound/design.json", "--github"], {
        ...(env === undefined ? {} : { env }),
        fetch: replay.fetch,
      });
      expect(run).toMatchObject({
        code: ExitCode.data,
        stdout: "",
        stderr: "--github needs a token in GH_TOKEN or GITHUB_TOKEN\n",
      });
      expect(replay.requests).toEqual([]);
      expect(global).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["no token", {}, ExitCode.invalid, "broken.json", /^broken\.json:1:\d+: error parse at \/: /],
    ["a bad token", { GH_TOKEN: CANARY }, ExitCode.invalid, "broken.json", /^broken\.json:1:/],
    [
      "no token",
      {},
      ExitCode.input,
      "missing.json",
      /^design file "missing\.json" does not exist\n$/,
    ],
    [
      "no token",
      {},
      ExitCode.invalid,
      "lost/design.json",
      /error asset at \/assets\/images\/logo\/src: /,
    ],
  ])(
    "a design that fails to load (%s, %s) fails first, without a request",
    async (_name, env, code, design, message) => {
      await tree.file("broken.json", '{ "version": 0,');
      await tree.file("lost/design.json", boundDesign("{{ github.following }}"));
      const replay = githubReplay(echoing(401));
      const global = vi.spyOn(globalThis, "fetch");
      for (const name of ["render", "validate"]) {
        const run = await tree.run([name, design, "--github"], { env, fetch: replay.fetch });
        expect(run.code).toBe(code);
        expect(run.stderr).toMatch(message);
        expect(run.stderr).not.toContain("GitHub data");
        expect(run.stderr).not.toContain("GH_TOKEN");
      }
      expect(replay.requests).toEqual([]);
      expect(global).not.toHaveBeenCalled();
    },
  );

  test("a 401 exits with 4 and the GitHubDataError code", async () => {
    const replay = githubReplay(echoing(401));
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env: { GH_TOKEN: CANARY },
      fetch: replay.fetch,
    });
    expect(run.code).toBe(ExitCode.data);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/^GitHub data \(unauthorized\): .*\n$/);
  });

  test("an invalid --login exits with 4 invalid-option before any request", async () => {
    const replay = githubReplay();
    const run = await tree.run(
      ["render", "bound/design.json", "--github", "--login", "not a login"],
      { env: { GH_TOKEN: CANARY }, fetch: replay.fetch },
    );
    expect(run.code).toBe(ExitCode.data);
    expect(run.stderr).toMatch(/^GitHub data \(invalid-option\): /);
    expect(replay.requests).toEqual([]);
  });
});

describe("liveData and loadLiveData", () => {
  test("without --github the environment is never read, with it only once the load starts", () => {
    const env = new Proxy(
      {},
      {
        get: () => {
          throw new Error("env read");
        },
      },
    );
    const io = { stdout: vi.fn(), stderr: vi.fn(), cwd: ".", env };
    expect(liveData({ design: "d.json" }, io)).toEqual({});
    // With --github the environment is read only when the load starts, after the design loaded.
    const { loadData } = liveData({ design: "d.json", github: true }, io);
    expect(loadData).toBeTypeOf("function");
    expect(() => loadData?.()).toThrow("env read");
  });

  test("loadLiveData binds the data as { github } and maps a failure to exit code 4 without a cause", async () => {
    const data = await loadLiveData({ token: CANARY, fetch: githubReplay().fetch });
    expect(Object.keys(data)).toEqual(["github"]);
    const failure = await loadLiveData({
      token: CANARY,
      fetch: githubReplay(echoing(500)).fetch,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CliError);
    expect(failure).toMatchObject({ exitCode: ExitCode.data });
    expect((failure as CliError).cause).toBeUndefined();
    expect((failure as CliError).lines).toEqual([
      expect.stringMatching(/^GitHub data \(http\): /) as string,
    ]);
  });
});

describe("preview --github", () => {
  async function status(port: number): Promise<{ version: number; ok: boolean }> {
    return new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port, path: "/status", agent: false },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => (body += chunk));
          response.on("end", () => {
            resolve(JSON.parse(body) as { version: number; ok: boolean });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  async function until(condition: () => boolean | Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error("timed out");
      await sleep(10);
    }
  }

  test("loads the data once; a design edit renders again without a request", async () => {
    const replay = githubReplay();
    const controller = new AbortController();
    let stderr = "";
    const exit = runCli(["preview", "bound/design.json", "--github", "--port", "0"], {
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
      cwd: tree.root,
      signal: controller.signal,
      pollIntervalMs: 20,
      env: { GH_TOKEN: CANARY },
      fetch: replay.fetch,
    });
    try {
      let port = 0;
      await until(() => {
        port = Number(/preview: http:\/\/127\.0\.0\.1:(\d+)\//.exec(stderr)?.[1] ?? 0);
        return port > 0;
      });
      await until(async () => (await status(port)).ok);
      const requests = replay.requests.length;
      expect(requests).toBeGreaterThan(0);
      const { version } = await status(port);
      await tree.file("bound/design.json", boundDesign("{{ github.followers }}"));
      await until(async () => (await status(port)).version > version);
      expect(await status(port)).toMatchObject({ ok: true });
      expect(replay.requests.length).toBe(requests);
    } finally {
      controller.abort();
    }
    expect(await exit).toBe(ExitCode.ok);
    expect(stderr).not.toContain(CANARY);
  });

  test("Ctrl+C during the load ends it with exit code 0", async () => {
    const controller = new AbortController();
    const replay = githubReplay(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const exit = runCli(["preview", "bound/design.json", "--github", "--port", "0"], {
      stdout: () => undefined,
      stderr: () => undefined,
      cwd: tree.root,
      signal: controller.signal,
      env: { GH_TOKEN: CANARY },
      fetch: replay.fetch,
    });
    await until(() => replay.requests.length > 0);
    controller.abort();
    expect(await exit).toBe(ExitCode.ok);
  });

  test("a failed load exits with 4 before serving", async () => {
    let stderr = "";
    const code = await runCli(["preview", "bound/design.json", "--github", "--port", "0"], {
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
      cwd: tree.root,
      signal: new AbortController().signal,
      env: { GH_TOKEN: CANARY },
      fetch: githubReplay(echoing(401)).fetch,
    });
    expect(code).toBe(ExitCode.data);
    expect(stderr).toMatch(/^GitHub data \(unauthorized\): /);
    expect(stderr).not.toContain("preview:");
  });
});
