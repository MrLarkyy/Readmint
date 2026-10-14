import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { GitResult, GitRunner } from "../src/index.js";
import {
  type ActionRun,
  type ActionTree,
  CANARY,
  makeActionTree,
  recordingRunner,
} from "./actionTree.js";

const fixtures = join(import.meta.dirname, "..", "..", "data-github", "test", "fixtures");

function body(name: string): unknown {
  return (JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8")) as { body: unknown })
    .body;
}

/** Answers the profile and the last repository page of the data-github fixtures. */
const success = (url: string, init: RequestInit): Promise<Response> => {
  const sent = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
    operationName?: string;
  };
  const name = sent.operationName === "ReadmintProfile" ? "profile" : "repositories-3";
  return Promise.resolve(Response.json(body(name), { status: 200 }));
};

/** A GitHub that echoes the Authorization header back in its error message. */
const echoing =
  (status: number) =>
  (_url: string, init: RequestInit): Promise<Response> =>
    Promise.resolve(
      Response.json(
        { message: `bad ${new Headers(init.headers).get("authorization") ?? ""}` },
        { status },
      ),
    );

const networkError = (): Promise<Response> =>
  Promise.reject(new TypeError(`fetch failed for token ${CANARY}`));

/** git that succeeds, prints the token in a push error the way a credential helper might. */
function fakeGit(pushFails: boolean): GitRunner {
  return (args): Promise<GitResult> => {
    const command = args.find((arg) => !arg.startsWith("-") && !arg.includes("=")) ?? "";
    const ok = (stdout = ""): Promise<GitResult> =>
      Promise.resolve({ code: 0, stdout, stderr: "" });
    switch (command) {
      case "symbolic-ref":
        return ok("main\n");
      case "diff":
        return ok(
          args
            .filter((arg) => arg.startsWith(":(literal)"))
            .map((arg) => arg.slice(10))
            .join("\0"),
        );
      case "rev-parse":
        return ok("0123456789abcdef0123456789abcdef01234567\n");
      case "push":
        return Promise.resolve(
          pushFails
            ? {
                code: 128,
                stdout: "",
                stderr: `fatal: unable to access 'https://x-access-token:${CANARY}@github.com/o/r.git/'\n`,
              }
            : { code: 0, stdout: "", stderr: "" },
        );
      default:
        return ok();
    }
  };
}

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("card.json", {
    version: 0,
    canvas: { width: 40, height: 24 },
    layers: [{ type: "rect", width: 10, height: "{{github.counts.repositories}}", fill: "#000" }],
  });
  await tree.file("broken.json", {
    version: 0,
    canvas: { width: 40, height: 24 },
    layers: [{ type: "rect", width: 10, height: "{{github.nothing.here}}", fill: "#000" }],
  });
});

afterEach(async () => {
  await tree.remove();
});

const forms = [
  CANARY,
  Buffer.from(CANARY).toString("base64"),
  Buffer.from(`x-access-token:${CANARY}`).toString("base64"),
];

async function expectNoCanary(run: ActionRun, calls: ReturnType<typeof recordingRunner>["calls"]) {
  const written = await readdir(tree.root, { recursive: true });
  const contents = await Promise.all(
    written
      .filter((name) => name.endsWith(".svg"))
      .map((name) => readFile(join(tree.root, name), "utf8")),
  );
  const places = {
    log: run.log,
    outputs: run.outputText,
    files: contents.join("\n"),
    gitArgs: JSON.stringify(calls.map((call) => call.args)),
    gitEnv: JSON.stringify(calls.map((call) => call.env)),
    gitInput: JSON.stringify(calls.map((call) => call.input ?? "")),
  };
  for (const [place, text] of Object.entries(places)) {
    for (const form of forms) expect(text, place).not.toContain(form);
  }
}

describe("the token", { timeout: 30_000 }, () => {
  const inputs = { designs: "card.json", token: CANARY, login: "readmint-fixture" };

  test("is in no output, file, git argument or environment after a successful run", async () => {
    const recorder = recordingRunner(fakeGit(false));
    const run = await tree.run(inputs, {
      runGit: recorder.runGit,
      fetch: success,
      env: { GITHUB_TOKEN: CANARY, OTHER: `prefix ${CANARY}` },
    });
    expect(run.log).not.toContain("::error::");
    expect(run.code).toBe(0);
    expect(recorder.calls.length).toBeGreaterThan(0);
    expect(run.outputs.changed).toBe("true");
    await expectNoCanary(run, recorder.calls);
  });

  test.each([
    ["401", echoing(401), "unauthorized"],
    ["500", echoing(500), "http"],
    ["a network error", networkError, "network"],
  ])("is not printed when GitHub answers %s", async (_name, fetch, code) => {
    const recorder = recordingRunner(fakeGit(false));
    const run = await tree.run(inputs, { runGit: recorder.runGit, fetch });
    expect(run.code).toBe(1);
    expect(run.log).toContain(`::error::GitHub data (${code}): `);
    await expectNoCanary(run, recorder.calls);
  });

  test("is not printed when a design fails to render", async () => {
    const recorder = recordingRunner(fakeGit(false));
    const run = await tree.run(
      { ...inputs, designs: "card.json\nbroken.json" },
      {
        runGit: recorder.runGit,
        fetch: success,
      },
    );
    expect(run.code).toBe(1);
    expect(run.log).toContain("::error::broken.json");
    await expectNoCanary(run, recorder.calls);
  });

  test("is redacted from git's error output", async () => {
    const recorder = recordingRunner(fakeGit(true));
    const run = await tree.run(inputs, { runGit: recorder.runGit, fetch: success });
    expect(run.code).toBe(1);
    expect(run.log).toContain("x-access-token:***@github.com");
    await expectNoCanary(run, recorder.calls);
  });

  test("is redacted from an input error, even with data-file", async () => {
    const run = await tree.run({
      designs: "card.json",
      "data-file": "missing.json",
      token: CANARY,
      locale: CANARY + "!",
    });
    expect(run.code).toBe(1);
    expect(run.log).toContain('::error::input locale "***!"');
    await expectNoCanary(run, []);
  });
});
