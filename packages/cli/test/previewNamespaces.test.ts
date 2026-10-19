import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, runCli } from "../src/index.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

let tree: CliTree;
let requests: string[];

const env = { GH_TOKEN: "ghp_CANARYcanary0123456789CANARYcanary01", WAKA: "waka_0123456789abcdef" };

function design(name: string): object {
  return {
    version: 0,
    canvas: { width: 20, height: 20 },
    layers: [
      {
        type: "group",
        let: { [name]: "{{ 1 }}" },
        children: [{ type: "rect", width: 10, height: 10, fill: "#0969da" }],
      },
    ],
  };
}

const fetchSpy = (url: string): Promise<Response> => {
  requests.push(url);
  return Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } }));
};

beforeEach(async () => {
  tree = await makeCliTree();
  requests = [];
  await tree.file("clash/design.json", design("total"));
  await tree.file("ok/design.json", design("count"));
  await tree.file("sub/clash/design.json", design("total"));
  await tree.file("fixture.json", { total: 1 });
  await tree.file("other.json", { other: 1 });
});

afterEach(async () => {
  await tree.remove();
});

const sources: readonly (readonly [string, readonly string[]])[] = [
  ["--data-json", ["--data-json", "total=https://data.example/a.json"]],
  ["--data-feed", ["--data-feed", "total=https://blog.example/feed.xml"]],
  ["--data-wakatime", ["--data-wakatime", "total=WAKA"]],
  ["--data-registry", ["--data-registry", "total=npm:react"]],
];

describe("preview checks the namespaces before any request", () => {
  test.each(sources)("a let equal to a %s namespace", async (option, flags) => {
    const run = await tree.run(["preview", "clash/design.json", "--port", "0", ...flags], {
      fetch: fetchSpy,
      env,
    });
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain(`namespace of ${option} "total"`);
    expect(run.stderr).not.toContain("example");
    expect(run.stderr).not.toContain("preview:");
    expect(requests).toEqual([]);
  });

  test("a let named github with --github", async () => {
    await tree.file("gh/design.json", design("github"));
    const run = await tree.run(["preview", "gh/design.json", "--port", "0", "--github"], {
      fetch: fetchSpy,
      env,
    });
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain('namespace of --github "github"');
    expect(run.stderr).not.toContain(env.GH_TOKEN);
    expect(requests).toEqual([]);
  });

  test("a --root is honoured", async () => {
    const run = await tree.run(
      [
        "preview",
        "sub/clash/design.json",
        "--root",
        "sub",
        "--port",
        "0",
        "--data-json",
        "total=https://data.example/a.json",
      ],
      { fetch: fetchSpy, env },
    );
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain("namespace of --data-json");
    expect(requests).toEqual([]);
  });

  test("a --data fixture key equal to a --data-json namespace", async () => {
    const run = await tree.run(
      [
        "preview",
        "ok/design.json",
        "--data",
        "fixture.json",
        "--port",
        "0",
        "--data-json",
        "total=https://data.example/a.json",
      ],
      { fetch: fetchSpy, env },
    );
    expect(run.code).toBe(ExitCode.input);
    expect(run.stderr).toContain("is in the fixture data");
    expect(requests).toEqual([]);
  });

  async function started(argv: readonly string[]): Promise<{ stderr: string; code: number }> {
    const controller = new AbortController();
    let stderr = "";
    const exit = runCli(["preview", ...argv, "--port", "0"], {
      fetch: fetchSpy,
      env,
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
      cwd: tree.root,
      signal: controller.signal,
      pollIntervalMs: 20,
    });
    const deadline = Date.now() + 5000;
    while (!stderr.includes("preview: http") && Date.now() < deadline) await sleep(10);
    controller.abort();
    return { stderr, code: await exit };
  }

  test("a design without a clash starts and loads the data once", async () => {
    const run = await started([
      "ok/design.json",
      "--data-json",
      "total=https://data.example/a.json",
    ]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stderr).toContain("preview: http://127.0.0.1:");
    expect(requests).toEqual(["https://data.example/a.json"]);
  });

  test("an unreadable design still starts the preview", async () => {
    const run = await started(["missing.json", "--data-json", "total=https://data.example/a.json"]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stderr).toContain("preview: http://127.0.0.1:");
  });

  test("an unreadable fixture still starts the preview", async () => {
    const run = await started([
      "ok/design.json",
      "--data",
      "gone.json",
      "--data-json",
      "total=https://data.example/a.json",
    ]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stderr).toContain("preview: http://127.0.0.1:");
  });

  test("a fixture without a clash passes", async () => {
    const run = await started([
      "ok/design.json",
      "--data",
      "other.json",
      "--data-json",
      "total=https://data.example/a.json",
    ]);
    expect(run.code).toBe(ExitCode.ok);
    expect(requests).toEqual(["https://data.example/a.json"]);
  });
});
