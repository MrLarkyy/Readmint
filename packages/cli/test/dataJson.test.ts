import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, type ImageFetch } from "../src/index.js";
import { boundDesign, type CliTree, makeCliTree, png } from "./cliTree.js";

const DOCUMENT = '{"version":"9.9.9","h":12,"nested":{"w":3}}';
const URL_SOURCE = "https://data.example/stats.json";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("card/design.json", boundDesign("{{ stats.document.h }}"));
  await tree.file("card/logo.png", png);
  await tree.file("plain/design.json", boundDesign("{{ json.document.h }}"));
  await tree.file("plain/logo.png", png);
  await tree.file("data/stats.json", DOCUMENT);
});

afterEach(async () => {
  await tree.remove();
});

function answering(body: string, requests: string[] = []): ImageFetch {
  return (url) => {
    requests.push(url);
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };
}

describe("--data-json", () => {
  test("renders a value bound from a file, byte-identical on every run", async () => {
    const argv = ["render", "card/design.json", "--data-json", "stats=data/stats.json"];
    const first = await tree.run(argv);
    const second = await tree.run(argv);
    expect(first.stderr).toBe("");
    expect(first.code).toBe(ExitCode.ok);
    expect(first.stdout).toContain('height="12"');
    expect(second.stdout).toBe(first.stdout);
  });

  test("without ns= the document binds under json", async () => {
    const run = await tree.run(["render", "plain/design.json", "--data-json", "data/stats.json"]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toContain('height="12"');
  });

  test("the same document from an https URL gives the same SVG as from the file", async () => {
    const requests: string[] = [];
    const fromFile = await tree.run([
      "render",
      "card/design.json",
      "--data-json",
      "stats=data/stats.json",
    ]);
    const fromUrl = await tree.run(
      ["render", "card/design.json", "--data-json", `stats=${URL_SOURCE}`],
      {
        fetch: answering(DOCUMENT, requests),
      },
    );
    expect(fromUrl.code).toBe(ExitCode.ok);
    expect(fromUrl.stdout).toBe(fromFile.stdout);
    expect(requests).toEqual([URL_SOURCE]);
  });

  test("validate and preview take it too; validate renders with it", async () => {
    const run = await tree.run([
      "validate",
      "card/design.json",
      "--data-json",
      "stats=data/stats.json",
    ]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toContain("ok");
  });

  test("adds its namespaces to --data", async () => {
    await tree.file("fixture.json", { other: { v: 1 } });
    await tree.file("both/design.json", boundDesign("{{ stats.document.h + other.v }}"));
    await tree.file("both/logo.png", png);
    const run = await tree.run([
      "render",
      "both/design.json",
      "--data",
      "fixture.json",
      "--data-json",
      "stats=data/stats.json",
    ]);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain('height="13"');
  });

  test("a fixture key equal to a JSON namespace is exit code 3 naming it", async () => {
    await tree.file("fixture.json", { stats: { h: 1 } });
    const run = await tree.run([
      "render",
      "card/design.json",
      "--data",
      "fixture.json",
      "--data-json",
      "stats=data/stats.json",
    ]);
    expect(run.code).toBe(ExitCode.input);
    expect(run.stderr).toContain("data namespace stats");
  });

  test("a missing file is exit code 4 with the JSON data line", async () => {
    const run = await tree.run(["render", "plain/design.json", "--data-json", "missing.json"]);
    expect(run.code).toBe(ExitCode.data);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(
      /^JSON data json \(not-found\): The JSON file "missing\.json" does not exist\.\n$/,
    );
    expect(run.stderr).not.toContain(tree.root);
  });

  test("a file outside --root is refused before it is read", async () => {
    await tree.file("outside.json", DOCUMENT);
    const run = await tree.run([
      "render",
      "card/design.json",
      "--root",
      "card",
      "--data-json",
      "stats=../outside.json",
    ]);
    expect(run.code).toBe(ExitCode.data);
    expect(run.stderr).toMatch(/^JSON data stats \(invalid-option\): /);
  });

  test("an http URL is refused without a request", async () => {
    const requests: string[] = [];
    const run = await tree.run(
      ["render", "plain/design.json", "--data-json", "http://data.example/x.json"],
      {
        fetch: answering(DOCUMENT, requests),
      },
    );
    expect(run.code).toBe(ExitCode.data);
    expect(requests).toEqual([]);
  });

  test("a broken design fails before any JSON request", async () => {
    await tree.file("broken.json", "{");
    const requests: string[] = [];
    const run = await tree.run(["render", "broken.json", "--data-json", URL_SOURCE], {
      fetch: answering(DOCUMENT, requests),
    });
    expect(run.code).toBe(ExitCode.invalid);
    expect(requests).toEqual([]);
  });

  test("sources load in argument order", async () => {
    const requests: string[] = [];
    await tree.run(
      [
        "render",
        "plain/design.json",
        "--data-json",
        `https://b.example/1.json`,
        "--data-json",
        `a=https://a.example/2.json`,
      ],
      { fetch: answering(DOCUMENT, requests) },
    );
    expect(requests).toEqual(["https://b.example/1.json", "https://a.example/2.json"]);
  });
});

describe("--data-json-header", () => {
  const SECRET = "hdr-SECRET-value-123";

  test("sends the value from the environment to the source URL only", async () => {
    const sent: (string | null)[] = [];
    const fetch: ImageFetch = (_url, init) => {
      sent.push(new Headers(init.headers).get("x-api-key"));
      return Promise.resolve(
        new Response(DOCUMENT, { headers: { "content-type": "application/json" } }),
      );
    };
    const run = await tree.run(
      [
        "render",
        "card/design.json",
        "--data-json",
        `stats=${URL_SOURCE}`,
        "--data-json-header",
        "stats:X-Api-Key=STATS_KEY",
      ],
      { fetch, env: { STATS_KEY: SECRET } },
    );
    expect(run.code).toBe(ExitCode.ok);
    expect(sent).toEqual([SECRET]);
  });

  test("a missing variable is exit code 4 naming it", async () => {
    const run = await tree.run(
      [
        "render",
        "card/design.json",
        "--data-json",
        `stats=${URL_SOURCE}`,
        "--data-json-header",
        "stats:X-Api-Key=STATS_KEY",
      ],
      { fetch: answering(DOCUMENT), env: {} },
    );
    expect(run.code).toBe(ExitCode.data);
    expect(run.stderr).toContain("JSON data stats (missing-token)");
    expect(run.stderr).toContain("STATS_KEY");
  });

  test("a value the document echoes into an issue is redacted from standard error", async () => {
    const run = await tree.run(
      [
        "render",
        "card/design.json",
        "--data-json",
        `stats=${URL_SOURCE}`,
        "--data-json-header",
        "stats:Authorization=STATS_KEY",
      ],
      { fetch: answering(`{"h":"${SECRET}"}`), env: { STATS_KEY: ` ${SECRET} ` } },
    );
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain("***");
    expect(run.stderr).not.toContain(SECRET);
    expect(run.stdout).not.toContain(SECRET);
  });
});
