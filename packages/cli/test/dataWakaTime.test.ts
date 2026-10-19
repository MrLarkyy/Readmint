import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wakaTimeSecretForms } from "@readmint/data-wakatime";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, type ImageFetch, parseDataWakaTimeArgs } from "../src/index.js";
import { parseCliArgs } from "../src/parseCliArgs.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

const STATS = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "data-wakatime",
    "test",
    "fixtures",
    "stats-last_7_days.json",
  ),
  "utf8",
);
const KEY = "waka_CLI000rm158-0000-4000-8000-c4n4ryk3y000";
const env = { WAKATIME_API_KEY: KEY };
const font = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "components",
    "templates",
    "fonts",
    "Montserrat-Medium.ttf",
  ),
);

function textDesign(content: string, lets?: Record<string, string>): object {
  return {
    version: 0,
    canvas: { width: 600, height: 40, background: "#ffffff" },
    assets: {
      fonts: {
        body: {
          family: "Montserrat",
          src: "Montserrat-Medium.ttf",
          weight: 500,
          licence: { embedding: "allowed", name: "OFL-1.1" },
        },
      },
    },
    layers: [
      {
        type: "text",
        x: 4,
        y: 24,
        content,
        font: "body",
        ...(lets === undefined ? {} : { let: lets }),
      },
    ],
  };
}

function serving(answer: () => Response, requests: string[] = []): ImageFetch {
  return (url) => {
    requests.push(url);
    return Promise.resolve(answer());
  };
}

const stats = () => new Response(STATS, { headers: { "content-type": "application/json" } });

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("Montserrat-Medium.ttf", font);
});

afterEach(async () => {
  await tree.remove();
});

async function render(
  content: string,
  args: readonly string[],
  fetch: ImageFetch = serving(stats),
  runEnv: Record<string, string> = env,
) {
  await tree.file("design.json", textDesign(content));
  return tree.run(["render", "design.json", ...args], { fetch, env: runEnv });
}

describe("parseDataWakaTimeArgs", () => {
  test("takes [<ns>=]<ENV_NAME> and <ns>=<range>", () => {
    expect(parseDataWakaTimeArgs(["WAKATIME_API_KEY", "work=_WORK_2"], ["work=all_time"])).toEqual({
      specs: [
        { namespace: "wakatime", variable: "WAKATIME_API_KEY" },
        { namespace: "work", variable: "_WORK_2", range: "all_time" },
      ],
      problems: [],
    });
  });

  test("a key in place of a variable name is refused without printing it", () => {
    const uuid = "0f1e2d3c-4b5a-4968-8776-aabbccddeeff";
    for (const key of [`waka_${uuid}`, `WAKA_${uuid.toUpperCase()}`, uuid, `w=waka_${uuid}`]) {
      const { problems } = parseDataWakaTimeArgs([key], []);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("looks like an API key (not printed)");
      expect(problems.join("")).not.toContain(uuid);
    }
  });

  test("variable names that start like a key prefix are variable names", () => {
    expect(parseDataWakaTimeArgs(["WAKA_API_KEY", "t=WAKA_TOKEN", "k=waka_key"], [])).toEqual({
      specs: [
        { namespace: "wakatime", variable: "WAKA_API_KEY" },
        { namespace: "t", variable: "WAKA_TOKEN" },
        { namespace: "k", variable: "waka_key" },
      ],
      problems: [],
    });
  });

  test("an invalid name, a duplicate, a range without a source and a bad range are problems", () => {
    expect(
      parseDataWakaTimeArgs(["A-B", "WAKA", "x=1X", "x=Y"], ["q=all_time", "x=today", "bad"])
        .problems,
    ).toEqual([
      "WakaTime source wakatime must name an environment variable (letters, digits and _, not starting with a digit)",
      "WakaTime namespace wakatime is given twice",
      "WakaTime source x must name an environment variable (letters, digits and _, not starting with a digit)",
      "WakaTime namespace x is given twice",
      "a WakaTime range names namespace q, which has no WakaTime source",
      "the range of WakaTime source x must be one of last_7_days, last_30_days, last_6_months, last_year, all_time",
      "a WakaTime range must be <namespace>=<range>",
    ]);
    expect(parseDataWakaTimeArgs(["a=A", "b=B", "c=C", "d=D", "e=E"], []).problems).toEqual([
      "at most 4 WakaTime sources may be given",
    ]);
  });
});

describe("--data-wakatime", () => {
  test("binds the stats under wakatime, byte-identical on every run", async () => {
    const requests: string[] = [];
    const fetch = serving(stats, requests);
    const content =
      "{{ wakatime.humanReadableTotal }} {{ wakatime.languages[0].name }} {{ wakatime.editors[0].percent }}";
    const first = await render(content, ["--data-wakatime", "WAKATIME_API_KEY"], fetch);
    const second = await render(content, ["--data-wakatime", "WAKATIME_API_KEY"], fetch);
    expect(first.stderr).toBe("");
    expect(first.code).toBe(ExitCode.ok);
    expect(first.stdout).toContain("27 hrs 26 mins TypeScript 59.5");
    expect(second.stdout).toBe(first.stdout);
    expect(requests).toEqual([
      "https://wakatime.com/api/v1/users/current/stats/last_7_days",
      "https://wakatime.com/api/v1/users/current/stats/last_7_days",
    ]);
  });

  test("a namespace and a range go to the request and the data", async () => {
    const requests: string[] = [];
    const run = await render(
      "{{ work.range }}",
      ["--data-wakatime", "work=WAKATIME_API_KEY", "--data-wakatime-range", "work=last_year"],
      serving(stats, requests),
    );
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toContain("last_year");
    expect(requests).toEqual(["https://wakatime.com/api/v1/users/current/stats/last_year"]);
  });

  test("an unset or empty variable is exit code 4 naming it, before any request", async () => {
    for (const runEnv of [{}, { WAKATIME_API_KEY: "  " }]) {
      const requests: string[] = [];
      const run = await render(
        "{{ wakatime.totalSeconds }}",
        ["--data-wakatime", "WAKATIME_API_KEY"],
        serving(stats, requests),
        runEnv,
      );
      expect(run.code).toBe(ExitCode.data);
      expect(run.stderr).toBe(
        "WakaTime data wakatime needs the API key in environment variable WAKATIME_API_KEY, which is not set or empty\n",
      );
      expect(requests).toEqual([]);
    }
  });

  test("a failed load is exit code 4 with the WakaTime line", async () => {
    const run = await render(
      "{{ wakatime.totalSeconds }}",
      ["--data-wakatime", "WAKATIME_API_KEY"],
      serving(
        () => new Response("{}", { status: 401, headers: { "content-type": "application/json" } }),
      ),
    );
    expect(run.code).toBe(ExitCode.data);
    expect(run.stderr).toBe(
      "WakaTime data wakatime (unauthorized): WakaTime rejected the API key (HTTP 401).\n",
    );
  });

  test("a 202 answer prints exactly one warning line and renders the empty data, exit 0", async () => {
    const run = await render(
      "[{{ wakatime.humanReadableTotal }}]{{ wakatime.languages | length }}",
      ["--data-wakatime", "WAKATIME_API_KEY"],
      serving(() => new Response(null, { status: 202 })),
    );
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toContain("[]0");
    expect(run.stderr).toBe(
      "warning: WakaTime data wakatime is incomplete: WakaTime is still calculating the stats, so the numbers may be low or empty (run again later; this answer was not cached)\n",
    );
  });

  test("--cache-dir serves a second run without a request and never holds the key", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "readmint-cli-wakatime-"));
    try {
      const requests: string[] = [];
      const fetch = serving(stats, requests);
      const args = ["--data-wakatime", "WAKATIME_API_KEY", "--cache-dir", cacheDir];
      const first = await render("{{ wakatime.totalSeconds }}", args, fetch);
      const second = await render("{{ wakatime.totalSeconds }}", args, fetch);
      expect(first.code).toBe(ExitCode.ok);
      expect(second.stdout).toBe(first.stdout);
      expect(requests).toHaveLength(1);
      for (const name of readdirSync(cacheDir)) {
        const text = readFileSync(join(cacheDir, name), "utf8");
        for (const form of [...wakaTimeSecretForms(KEY), "secret-client-project"]) {
          expect(name).not.toContain(form);
          expect(text).not.toContain(form);
        }
      }
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("adds its namespace after the feeds and to --data", async () => {
    await tree.file("fixture.json", { other: { v: "F" } });
    const run = await render("{{ other.v }}{{ wakatime.operatingSystems[0].name }}", [
      "--data",
      "fixture.json",
      "--data-wakatime",
      "WAKATIME_API_KEY",
    ]);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("FWindows");
  });

  test("a fixture key equal to its namespace is exit code 3 naming it", async () => {
    await tree.file("fixture.json", { wakatime: {} });
    const run = await render("{{ wakatime.totalSeconds }}", [
      "--data",
      "fixture.json",
      "--data-wakatime",
      "WAKATIME_API_KEY",
    ]);
    expect(run.code).toBe(ExitCode.input);
    expect(run.stderr).toContain("data namespace wakatime");
  });

  test("a fixture key equal to its namespace fails before any request, for every command but preview", async () => {
    await tree.file("fixture.json", { stats: {} });
    await tree.file("design.json", textDesign("{{ stats }}"));
    await tree.file("renders.json", { renders: [{ name: "card", design: "design.json" }] });
    for (const argv of [
      ["render", "design.json"],
      ["validate", "design.json"],
      ["render", "--manifest", "renders.json", "--out-dir", "out"],
    ]) {
      const requests: string[] = [];
      const run = await tree.run(
        [...argv, "--data", "fixture.json", "--data-wakatime", "stats=WAKATIME_API_KEY"],
        { fetch: serving(stats, requests), env },
      );
      expect(run.code, argv.join(" ")).toBe(ExitCode.input);
      expect(run.stderr).toContain("data namespace stats");
      expect(requests).toEqual([]);
    }
  });

  test("a let name equal to its namespace is exit code 1 before any request", async () => {
    const requests: string[] = [];
    await tree.file("design.json", textDesign("{{ coding }}", { coding: "{{ 1 }}" }));
    const run = await tree.run(
      ["render", "design.json", "--data-wakatime", "coding=WAKATIME_API_KEY"],
      { fetch: serving(stats, requests), env },
    );
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain('is also the namespace of --data-wakatime "coding"');
    expect(requests).toEqual([]);
  });
});

describe("--data-wakatime on the command line", () => {
  test.each([
    [
      ["--github", "--data-wakatime", "github=K"],
      "--data-wakatime namespace github clashes with --github",
    ],
    [
      ["--data-json", "x=a.json", "--data-wakatime", "x=K"],
      "--data-wakatime namespace x is also a --data-json namespace",
    ],
    [
      ["--data-feed", "x=https://f.example/x", "--data-wakatime", "x=K"],
      "--data-wakatime namespace x is also a --data-feed namespace",
    ],
    [
      ["--data-wakatime", "K", "--data-wakatime", "K"],
      "WakaTime namespace wakatime is given twice",
    ],
    [["--data-wakatime-range", "wakatime=all_time"], "which has no WakaTime source"],
    [["--data-wakatime", "K", "--data-wakatime-range", "wakatime=week"], "must be one of"],
    [["--cache-dir", "c"], "option --cache-dir needs --github, --data-wakatime or --data-registry"],
  ])("%j is a usage error", (args, message) => {
    expect(() => parseCliArgs(["render", "a.json", ...args])).toThrow(message);
  });

  test("a WakaTime key in any argument is a usage error that never prints it", async () => {
    const key = ["waka", "0f1e2d3c-4b5a-4968-8776-aabbccddeeff"].join("_");
    for (const args of [
      ["--data-wakatime", "wakatime", key],
      [`--data-wakatime=${key}`],
      ["--data-wakatime", `w=${key}`],
      [`--unknown=${key}`],
      [key],
    ]) {
      const run = await tree.run(["render", "design.json", ...args], { env });
      expect(run.code, args.join(" ")).toBe(ExitCode.usage);
      expect(run.stderr).toContain("looks like a WakaTime API key; not printed");
      expect(run.stderr).not.toContain("0f1e2d3c");
    }
  });

  test("WAKA_API_KEY and WAKA_TOKEN are accepted variable names", () => {
    expect(
      parseCliArgs([
        "render",
        "a.json",
        "--data-wakatime",
        "WAKA_API_KEY",
        "--data-wakatime",
        "t=WAKA_TOKEN",
      ]),
    ).toMatchObject({
      dataWakaTime: [
        { namespace: "wakatime", variable: "WAKA_API_KEY" },
        { namespace: "t", variable: "WAKA_TOKEN" },
      ],
    });
  });

  test("render, validate and preview take it; --cache-dir goes with it alone", () => {
    for (const command of ["render", "validate", "preview"]) {
      expect(
        parseCliArgs([command, "a.json", "--data-wakatime", "K", "--cache-dir", "c"]),
      ).toMatchObject({ dataWakaTime: [{ namespace: "wakatime", variable: "K" }], cacheDir: "c" });
    }
  });

  test("validate renders with it; a broken design fails before any request", async () => {
    const requests: string[] = [];
    const fetch = serving(stats, requests);
    await tree.file("design.json", textDesign("{{ wakatime.dailyAverageSeconds }}"));
    const ok = await tree.run(["validate", "design.json", "--data-wakatime", "WAKATIME_API_KEY"], {
      fetch,
      env,
    });
    expect(ok.code).toBe(ExitCode.ok);
    await tree.file("broken.json", "{");
    const broken = await tree.run(
      ["render", "broken.json", "--data-wakatime", "WAKATIME_API_KEY"],
      { fetch, env },
    );
    expect(broken.code).toBe(ExitCode.invalid);
    expect(requests).toHaveLength(1);
  });
});
