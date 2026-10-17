import { request } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { loadGitHubData } from "@readmint/data-github";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CliError, ExitCode, loadLiveData, runCli } from "../src/index.js";
import { liveData } from "../src/liveData.js";
import { boundDesign, type CliTree, makeCliTree, png } from "./cliTree.js";
import { CANARY, echoing, fixtureBody, githubReplay } from "./githubFetch.js";

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
      "ReadmintActivity",
      "ReadmintWeeks",
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
      "ReadmintActivity",
      "ReadmintWeeks",
    ]);
    for (const request of sent.slice(0, 3)) {
      expect(request.variables?.["login"]).toBe("readmint-fixture");
    }
  });

  test("a refused part is one stderr warning line and the render still succeeds", async () => {
    const names: Record<string, string> = {
      ReadmintViewer: "viewer",
      ReadmintProfile: "profile",
      ReadmintRepositories: "repositories-3",
      ReadmintActivity: "activity-forbidden",
      ReadmintWeeks: "weeks-graphql-error",
    };
    const replay = githubReplay((_url, init) => {
      const sent = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
        operationName?: string;
      };
      return Promise.resolve(
        Response.json(fixtureBody(names[sent.operationName ?? ""] ?? "viewer")),
      );
    });
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env: { GH_TOKEN: CANARY },
      fetch: replay.fetch,
    });
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toMatch(/^<svg /);
    expect(run.stderr).toBe(
      "warning: GitHub data is incomplete (activity, weeks): github.status and github.pushes are empty and github.pinned falls back to the top repositories; github.pinned[].weeklyCommits is null\n",
    );
    expect(run.stderr).not.toContain(CANARY);
  });

  test("a complete load prints no warning", async () => {
    const run = await tree.run(["render", "bound/design.json", "--github"], {
      env: { GH_TOKEN: CANARY },
      fetch: githubReplay().fetch,
    });
    expect(run.stderr).toBe("");
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

  test("--exclude-repositories loads, and an invalid name fails without echoing it", async () => {
    const replay = githubReplay();
    const run = await tree.run(
      ["render", "bound/design.json", "--github", "--exclude-repositories", "readmint,x/y"],
      { env: { GH_TOKEN: CANARY }, fetch: replay.fetch },
    );
    expect(run).toMatchObject({ code: ExitCode.ok, stderr: "" });
    const bad = githubReplay();
    const failed = await tree.run(
      ["render", "bound/design.json", "--github", "--exclude-repositories", "secret repo"],
      { env: { GH_TOKEN: CANARY }, fetch: bad.fetch },
    );
    expect(failed.code).toBe(ExitCode.data);
    expect(failed.stderr).toMatch(/^GitHub data \(invalid-option\): /);
    expect(failed.stderr).not.toContain("secret");
    expect(bad.requests).toEqual([]);
  });

  test("--language-commit-cap reads the commits and warns when GitHub's answer is unusable", async () => {
    const replay = githubReplay();
    const run = await tree.run(
      ["render", "bound/design.json", "--github", "--language-commit-cap", "3"],
      { env: { GH_TOKEN: CANARY }, fetch: replay.fetch },
    );
    expect(run.code).toBe(ExitCode.ok);
    expect(replay.graphql().map((request) => request.operation)).toContain("ReadmintContributed");
    expect(run.stderr).toMatch(/^warning: GitHub data is incomplete \(authored\): .*\n$/);
    expect(run.stderr).not.toContain(CANARY);
    const plain = githubReplay();
    await tree.run(["render", "bound/design.json", "--github"], {
      env: { GH_TOKEN: CANARY },
      fetch: plain.fetch,
    });
    expect(plain.graphql().map((request) => request.operation)).not.toContain(
      "ReadmintContributed",
    );
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
  test("without --github the environment is never read, with it only once the load starts", async () => {
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
    await expect(loadData?.()).rejects.toThrow("env read");
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
  interface Printed {
    readonly port: number;
    readonly secret: string;
  }

  function get(port: number, path: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path, agent: false }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () => {
          resolve({ status: response.statusCode ?? 0, body });
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  async function status({ port, secret }: Printed): Promise<{ version: number; ok: boolean }> {
    return JSON.parse((await get(port, `/${secret}/status`)).body) as {
      version: number;
      ok: boolean;
    };
  }

  /** The address the preview printed: its port and its 43-character secret. */
  function printed(stderr: string): Printed | undefined {
    const match = /preview: http:\/\/127\.0\.0\.1:(\d+)\/([A-Za-z0-9_-]{43})\/\n/.exec(stderr);
    return match === null ? undefined : { port: Number(match[1]), secret: match[2] ?? "" };
  }

  function startLive(replay: ReturnType<typeof githubReplay>) {
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
    return { controller, exit, stderr: () => stderr };
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
    const { controller, exit, stderr } = startLive(replay);
    try {
      let at: Printed | undefined;
      await until(() => (at = printed(stderr())) !== undefined);
      const live = at as Printed;
      await until(async () => (await status(live)).ok);
      const requests = replay.requests.length;
      expect(requests).toBeGreaterThan(0);
      const { version } = await status(live);
      await tree.file("bound/design.json", boundDesign("{{ github.followers }}"));
      await until(async () => (await status(live)).version > version);
      expect(await status(live)).toMatchObject({ ok: true });
      expect(replay.requests.length).toBe(requests);
    } finally {
      controller.abort();
    }
    expect(await exit).toBe(ExitCode.ok);
    expect(stderr()).not.toContain(CANARY);
  });

  test("serves live data only under the printed secret; each run prints a new one", async () => {
    const secrets: string[] = [];
    for (let run = 0; run < 2; run += 1) {
      const { controller, exit, stderr } = startLive(githubReplay());
      try {
        let at: Printed | undefined;
        await until(() => (at = printed(stderr())) !== undefined);
        const { port, secret } = at as Printed;
        secrets.push(secret);
        for (const path of ["/", "/status", "/render.svg", "/events"]) {
          const refused = await get(port, path);
          expect(refused.status).toBe(403);
          expect(refused.body).not.toContain("<svg");
        }
        const svg = await get(port, `/${secret}/render.svg`);
        expect(svg.status).toBe(200);
        const rendered = await tree.run(["render", "bound/design.json", "--github"], {
          env: { GH_TOKEN: CANARY },
          fetch: githubReplay().fetch,
        });
        expect(svg.body).toBe(rendered.stdout);
        expect((await get(port, `/${secret}/status`)).body).not.toContain(secret);
      } finally {
        controller.abort();
      }
      expect(await exit).toBe(ExitCode.ok);
    }
    expect(secrets[0]).not.toBe(secrets[1]);
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
