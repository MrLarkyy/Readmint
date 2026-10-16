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
  png,
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
  const names: Record<string, string> = {
    ReadmintProfile: "profile",
    ReadmintActivity: "activity",
    ReadmintWeeks: "weeks",
  };
  const name = names[sent.operationName ?? ""] ?? "repositories-3";
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
const sha = "0123456789abcdef0123456789abcdef01234567";

function fakeGit(pushFails: boolean): GitRunner {
  return (args): Promise<GitResult> => {
    const command = args.find((arg) => !arg.startsWith("-") && !arg.includes("=")) ?? "";
    const ok = (stdout = ""): Promise<GitResult> =>
      Promise.resolve({ code: 0, stdout, stderr: "" });
    switch (command) {
      case "symbolic-ref":
        return ok("refs/heads/main\n");
      case "ls-remote":
        return ok(`${sha}\trefs/heads/main\n`);
      case "diff":
        return ok(
          args
            .filter((arg) => arg.startsWith(":(literal)"))
            .map((arg) => arg.slice(10))
            .join("\0"),
        );
      case "rev-parse":
        return ok(`${sha}\n`);
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

describe("images bound from data (RM-28)", { timeout: 30_000 }, () => {
  const avatar = "https://avatars.githubusercontent.com/u/1?v=4";
  const avatarDesign = {
    version: 0,
    canvas: { width: 40, height: 24 },
    assets: { images: { avatar: { src: "{{ github.avatarUrl }}" } } },
    layers: [{ type: "image", asset: "avatar", x: 4, y: 4, width: 16, height: 16 }],
  };

  /** GitHub's API from the fixtures, and an image host answering a PNG; every request recorded. */
  function hosts() {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (url: string, init: RequestInit): Promise<Response> => {
      calls.push({ url, init });
      if (url.startsWith("https://api.github.com/")) return success(url, init);
      return Promise.resolve(new Response(new Uint8Array(png), { status: 200 }));
    };
    return { calls, fetch };
  }

  async function svgs(): Promise<string[]> {
    const written = await readdir(tree.root, { recursive: true });
    return Promise.all(
      written
        .filter((name) => name.endsWith(".svg"))
        .map((name) => readFile(join(tree.root, name), "utf8")),
    );
  }

  beforeEach(async () => {
    await tree.file("avatar.json", avatarDesign);
    await tree.file("avatar-2.json", avatarDesign);
  });

  test("the image request carries no token in any form, and the SVG inlines the image", async () => {
    const recorder = recordingRunner(fakeGit(false));
    const { calls, fetch } = hosts();
    const run = await tree.run(
      { designs: "avatar.json\navatar-2.json", token: CANARY, login: "readmint-fixture" },
      { runGit: recorder.runGit, fetch },
    );
    expect(run.log).not.toContain("::error::");
    expect(run.code).toBe(0);
    const images = calls.filter((call) => !call.url.startsWith("https://api.github.com/"));
    expect(images.map((call) => call.url)).toEqual([avatar]);
    for (const { init } of images) {
      const sent = JSON.stringify({
        ...init,
        headers: [...new Headers(init.headers).entries()],
      });
      expect(sent.toLowerCase()).not.toContain("authorization");
      for (const form of forms) expect(sent).not.toContain(form);
      expect(init.credentials).toBe("omit");
      expect(init.redirect).toBe("error");
    }
    const written = await svgs();
    expect(written).toHaveLength(2);
    for (const svg of written) {
      expect(svg).toContain('href="data:image/png;base64,');
      expect(svg).not.toContain("https:");
    }
    await expectNoCanary(run, recorder.calls);
  });

  test("data-file mode fetches the bound image too", async () => {
    await tree.file("data.json", { github: { avatarUrl: avatar } });
    const { calls, fetch } = hosts();
    const run = await tree.run(
      { designs: "avatar.json", "data-file": "data.json", "dry-run": "true" },
      { fetch },
    );
    expect(run.code).toBe(0);
    expect(calls.map((call) => call.url)).toEqual([avatar]);
    expect((await svgs())[0]).toContain('href="data:image/png;base64,');
  });

  test("a host off the allow-list fails the render with an error line naming image-host", async () => {
    await tree.file("data.json", { github: { avatarUrl: "https://evil.example/a.png" } });
    const { calls, fetch } = hosts();
    const run = await tree.run(
      { designs: "avatar.json", "data-file": "data.json", "dry-run": "true" },
      { fetch },
    );
    expect(run.code).toBe(1);
    expect(run.log).toContain(
      "::error::avatar.json: error image-host at /assets/images/avatar/src: ",
    );
    expect(calls).toEqual([]);
  });
});
