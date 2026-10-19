import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, type ImageFetch, parseDataRegistryArgs } from "../src/index.js";
import { parseCliArgs } from "../src/parseCliArgs.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** npm knows `react` only; Maven knows `junit:junit` only. */
function registries(requests: string[] = []): ImageFetch {
  return (url) => {
    requests.push(url);
    const target = new URL(url);
    if (target.hostname === "registry.npmjs.org") {
      return Promise.resolve(
        target.pathname === "/react/latest" ? json({ version: "19.1.0" }) : json({}, 404),
      );
    }
    if (target.hostname === "api.npmjs.org")
      return Promise.resolve(json({ downloads: 31_500_000 }));
    const known = target.searchParams.get("q") === 'g:"junit" AND a:"junit"';
    return Promise.resolve(
      json({
        response: {
          numFound: known ? 1 : 0,
          docs: known
            ? [{ g: "junit", a: "junit", latestVersion: "4.13.2", timestamp: 1_608_000_000_000 }]
            : [],
        },
      }),
    );
  };
}

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("Montserrat-Medium.ttf", font);
});

afterEach(async () => {
  await tree.remove();
});

async function render(content: string, args: readonly string[], fetch: ImageFetch = registries()) {
  await tree.file("design.json", textDesign(content));
  return tree.run(["render", "design.json", ...args], { fetch, env: {} });
}

describe("parseDataRegistryArgs", () => {
  test("groups entries by namespace in the order given", () => {
    expect(
      parseDataRegistryArgs([
        "npm:react",
        "maven:junit:junit",
        "lib=npm:@types/node",
        "npm:vue",
        "lib=maven:a.b:c",
      ]),
    ).toEqual({
      specs: [
        { namespace: "registry", npm: ["react", "vue"], maven: ["junit:junit"] },
        { namespace: "lib", npm: ["@types/node"], maven: ["a.b:c"] },
      ],
      problems: [],
    });
  });

  test("problems name the entry by position and never print a value", () => {
    const { problems } = parseDataRegistryArgs([
      "react",
      "npm:Not-Valid-SECRETVALUE",
      "maven:nocolon",
      "npm:ok",
      "npm:ok",
    ]);
    expect(problems).toEqual([
      "registry entry 1 must be npm:<name> or maven:<group>:<artifact>",
      "registry entry 2 is not a valid npm package name",
      "registry entry 3 is not a Maven coordinate (group:artifact)",
      "registry entry 5 repeats an earlier entry of namespace registry",
    ]);
    expect(problems.join("")).not.toContain("SECRETVALUE");
  });

  test("at most 20 entries per list and 4 namespaces", () => {
    const many = Array.from({ length: 21 }, (_, index) => `npm:p${String(index)}`);
    expect(parseDataRegistryArgs(many).problems).toEqual([
      "at most 20 npm entries may be given per namespace (registry)",
    ]);
    expect(
      parseDataRegistryArgs(["a=npm:x", "b=npm:x", "c=npm:x", "d=npm:x", "e=npm:x"]).problems,
    ).toEqual(["at most 4 registry namespaces may be given"]);
  });
});

describe("--data-registry", () => {
  test("binds the entries under registry, byte-identical on every run", async () => {
    const requests: string[] = [];
    const content =
      "{{ registry.npm[0].name }} {{ registry.npm[0].version }} {{ registry.npm[0].weeklyDownloads }} {{ registry.maven[0].latestVersion }} {{ registry.maven[0].updated }}";
    const args = ["--data-registry", "npm:react", "--data-registry", "maven:junit:junit"];
    const first = await render(content, args, registries(requests));
    const second = await render(content, args, registries(requests));
    expect(first.stderr).toBe("");
    expect(first.code).toBe(ExitCode.ok);
    expect(first.stdout).toContain("react 19.1.0 31500000 4.13.2 2020-12-15");
    expect(second.stdout).toBe(first.stdout);
    expect(requests).toHaveLength(6);
    expect(requests.every((url) => url.startsWith("https://"))).toBe(true);
  });

  test("a namespace goes to the data", async () => {
    const run = await render("{{ libs.npm[0].name }}", ["--data-registry", "libs=npm:react"]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toContain("react");
  });

  test("an unknown entry is one warning line, null in the data, exit 0", async () => {
    const run = await render("[{{ registry.npm[1] == null }}]", [
      "--data-registry",
      "npm:react",
      "--data-registry",
      "npm:nosuchpackage-readmint",
    ]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toContain("[true]");
    expect(run.stderr).toBe(
      "warning: Registry data registry has 1 unknown entry: npm:nosuchpackage-readmint; each is null in the data and was not cached\n",
    );
  });

  test("a failed load is exit code 4 with the registry line", async () => {
    const run = await render("{{ registry.npm[0].name }}", ["--data-registry", "npm:react"], () =>
      Promise.resolve(new Response("{}", { status: 418 })),
    );
    expect(run.code).toBe(ExitCode.data);
    expect(run.stderr).toBe(
      "Registry data registry (invalid-response): The npm registry API answered HTTP 418.\n",
    );
  });

  test("--cache-dir alone serves a second run without a request", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "readmint-cli-registry-"));
    try {
      const requests: string[] = [];
      const fetch = registries(requests);
      const args = ["--data-registry", "npm:react", "--cache-dir", cacheDir];
      const first = await render("{{ registry.npm[0].version }}", args, fetch);
      const second = await render("{{ registry.npm[0].version }}", args, fetch);
      expect(first.code).toBe(ExitCode.ok);
      expect(second.stdout).toBe(first.stdout);
      expect(requests).toHaveLength(2);
      expect(readdirSync(cacheDir).length).toBeGreaterThan(0);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  test("adds its namespace to --data", async () => {
    await tree.file("fixture.json", { other: { v: "F" } });
    const run = await render("{{ other.v }}{{ registry.npm[0].name }}", [
      "--data",
      "fixture.json",
      "--data-registry",
      "npm:react",
    ]);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("Freact");
  });

  test("a fixture key equal to its namespace fails before any request, for every command but preview", async () => {
    await tree.file("fixture.json", { registry: {} });
    await tree.file("design.json", textDesign("{{ registry }}"));
    await tree.file("renders.json", { renders: [{ name: "card", design: "design.json" }] });
    for (const argv of [
      ["render", "design.json"],
      ["validate", "design.json"],
      ["render", "--manifest", "renders.json", "--out-dir", "out"],
    ]) {
      const requests: string[] = [];
      const run = await tree.run(
        [...argv, "--data", "fixture.json", "--data-registry", "npm:react"],
        { fetch: registries(requests), env: {} },
      );
      expect(run.code, argv.join(" ")).toBe(ExitCode.input);
      expect(run.stderr).toContain("data namespace registry");
      expect(requests).toEqual([]);
    }
  });

  test("a let name equal to its namespace is exit code 1 before any request", async () => {
    const requests: string[] = [];
    await tree.file("design.json", textDesign("{{ libs }}", { libs: "{{ 1 }}" }));
    const run = await tree.run(["render", "design.json", "--data-registry", "libs=npm:react"], {
      fetch: registries(requests),
      env: {},
    });
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain('is also the namespace of --data-registry "libs"');
    expect(requests).toEqual([]);
  });
});

describe("--data-registry on the command line", () => {
  test.each([
    [
      ["--github", "--data-registry", "github=npm:react"],
      "--data-registry namespace github clashes with --github",
    ],
    [
      ["--data-json", "x=a.json", "--data-registry", "x=npm:react"],
      "--data-registry namespace x is also a --data-json namespace",
    ],
    [
      ["--data-wakatime", "x=K", "--data-registry", "x=npm:react"],
      "--data-registry namespace x is also a --data-wakatime namespace",
    ],
    [["--data-registry", "react"], "--data-registry: registry entry 1 must be npm:<name>"],
    [["--data-registry", "npm:React"], "registry entry 1 is not a valid npm package name"],
    [["--cache-dir", "c"], "option --cache-dir needs --github, --data-wakatime or --data-registry"],
  ])("%j is a usage error", (args, message) => {
    expect(() => parseCliArgs(["render", "a.json", ...args])).toThrow(message);
  });

  test("render, validate and preview take it; --cache-dir goes with it alone", () => {
    for (const command of ["render", "validate", "preview"]) {
      expect(
        parseCliArgs([command, "a.json", "--data-registry", "npm:react", "--cache-dir", "c"]),
      ).toMatchObject({
        dataRegistry: [{ namespace: "registry", npm: ["react"], maven: [] }],
        cacheDir: "c",
      });
    }
  });

  test("validate renders with it; a broken design fails before any request", async () => {
    const requests: string[] = [];
    const fetch = registries(requests);
    await tree.file("design.json", textDesign("{{ registry.npm[0].version }}"));
    const ok = await tree.run(["validate", "design.json", "--data-registry", "npm:react"], {
      fetch,
      env: {},
    });
    expect(ok.code).toBe(ExitCode.ok);
    await tree.file("broken.json", "{");
    const broken = await tree.run(["render", "broken.json", "--data-registry", "npm:react"], {
      fetch,
      env: {},
    });
    expect(broken.code).toBe(ExitCode.invalid);
    expect(requests).toHaveLength(2);
  });
});
