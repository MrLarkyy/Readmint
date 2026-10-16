import { describe, expect, test } from "vitest";
import { CliError, ExitCode } from "../src/index.js";
import { parseCliArgs } from "../src/parseCliArgs.js";

function usageError(argv: readonly string[]): CliError {
  try {
    parseCliArgs(argv);
  } catch (error) {
    if (error instanceof CliError && error.exitCode === ExitCode.usage) return error;
    throw error;
  }
  throw new Error(`no usage error for ${JSON.stringify(argv)}`);
}

test("--locale refuses a valid tag longer than the lookup accepts", () => {
  expect(() =>
    parseCliArgs(["render", "a.json", "--locale", "cs-CZ-u-nu-latn-ca-gregory-hc-h23-x-foo"]),
  ).toThrow("is not supported");
});

test("--locale refuses a language without a table", () => {
  expect(() => parseCliArgs(["render", "a.json", "--locale", "pl"])).toThrow("is not supported");
});

test("--locale accepts a region tag the expression tables resolve", () => {
  expect(parseCliArgs(["render", "a.json", "--locale", "cs-CZ"])).toMatchObject({
    locale: "cs-CZ",
  });
});

test.each([["render"], ["validate"], ["preview"]])("%s takes --github and --login", (name) => {
  expect(parseCliArgs([name, "a.json", "--github"])).toMatchObject({ name, github: true });
  expect(parseCliArgs([name, "a.json", "--github", "--login", "octocat"])).toMatchObject({
    name,
    github: true,
    login: "octocat",
  });
  expect(parseCliArgs([name, "a.json"])).not.toHaveProperty("github");
});

test.each([
  [["render", "a.json", "--login", "octocat"], "option --login needs --github"],
  [["render", "a.json", "--github", "--data", "d.json"], "--github and --data exclude each other"],
  [
    ["render", "a.json", "--github", "--login", "a", "--login", "b"],
    "option --login is given twice",
  ],
  [["render", "a.json", "--github=yes"], "option --github takes no value"],
  [["render", "a.json", "--github", "--login"], "option --login needs a value"],
])("%j is a usage error", (argv, message) => {
  expect(usageError(argv).message).toBe(`${message} (see readmint --help)`);
});

const token = "ghp_X1y2Z3secretSECRETsecret";

test.each([
  [["render", "a.json", "--token", token], "option --token does not exist"],
  [["render", "a.json", `--token=${token}`], "option --token does not exist"],
  [["render", "a.json", "--github", "--token"], "option --token does not exist"],
  [["render", "a.json", token], "an argument looks like a GitHub token; not printed"],
  [["render", token], "an argument looks like a GitHub token; not printed"],
  [[token], "an argument looks like a GitHub token; not printed"],
  [["render", "a.json", "--locale", token], "an argument looks like a GitHub token; not printed"],
  [["render", "a.json", `--out=${token}`], "an argument looks like a GitHub token; not printed"],
])("%j is a usage error that never shows the value", (argv, message) => {
  const error = usageError(argv);
  expect(error.message).toContain(message);
  expect(error.message).toContain("the token is read from GH_TOKEN or GITHUB_TOKEN");
  expect(error.message).not.toContain(token);
});

test.each(["gho_", "ghu_", "ghs_", "ghr_", "github_pat_"])(
  "a %s argument counts as a token",
  (prefix) => {
    expect(usageError(["render", "a.json", `${prefix}abc`]).message).not.toContain(prefix);
  },
);

test("preview takes --open; render and validate refuse it", () => {
  expect(parseCliArgs(["preview", "d.json", "--open"])).toMatchObject({
    name: "preview",
    open: true,
  });
  expect(parseCliArgs(["preview", "d.json"])).not.toHaveProperty("open");
  for (const name of ["render", "validate"]) {
    expect(() => parseCliArgs([name, "d.json", "--open"])).toThrow(
      `option --open does not apply to ${name}`,
    );
  }
  expect(() => parseCliArgs(["preview", "d.json", "--open=1"])).toThrow("takes no value");
});

test.each([["render"], ["validate"], ["preview"]])("%s takes --props", (name) => {
  expect(parseCliArgs([name, "a.json", "--props", "s.json"])).toMatchObject({
    name,
    props: "s.json",
  });
  expect(parseCliArgs([name, "a.json"])).not.toHaveProperty("props");
});

test("--props needs a value", () => {
  expect(usageError(["render", "a.json", "--props"]).exitCode).toBe(ExitCode.usage);
});

describe("--data-json", () => {
  test.each([["render"], ["validate"], ["preview"]])("%s takes it, repeated", (name) => {
    expect(
      parseCliArgs([
        name,
        "a.json",
        "--data-json",
        "a.json",
        "--data-json",
        "s=https://x.example/s",
      ]),
    ).toMatchObject({
      dataJson: [
        { namespace: "json", source: "a.json", headers: {} },
        { namespace: "s", source: "https://x.example/s", headers: {} },
      ],
    });
    expect(parseCliArgs([name, "a.json"])).not.toHaveProperty("dataJson");
  });

  test("a URL with = in its query stays one source under json", () => {
    expect(
      parseCliArgs(["render", "a.json", "--data-json", "https://x.example/q?a=1&b=2"]),
    ).toMatchObject({ dataJson: [{ namespace: "json", source: "https://x.example/q?a=1&b=2" }] });
    expect(parseCliArgs(["render", "a.json", "--data-json=Stats=x.json"])).toMatchObject({
      dataJson: [{ namespace: "json", source: "Stats=x.json" }],
    });
  });

  test("headers attach to their namespace, lower-cased", () => {
    expect(
      parseCliArgs([
        "render",
        "a.json",
        "--data-json",
        "api=https://x.example/s",
        "--data-json-header",
        "api:X-Api-Key=API_KEY",
        "--data-json-header",
        "api:Authorization=AUTH",
      ]),
    ).toMatchObject({
      dataJson: [{ namespace: "api", headers: { "x-api-key": "API_KEY", authorization: "AUTH" } }],
    });
  });

  test.each([
    [["--data-json", "a=x.json", "--data-json", "a=y.json"], "given twice"],
    [["--data-json", "x.json", "--data-json", "y.json"], "given twice"],
    [["--data-json-header", "api:X=KEY"], "no JSON source"],
    [["--data-json", "api=https://x.example", "--data-json-header", "api:X"], "<namespace>:"],
    [["--data-json", "api=https://x.example", "--data-json-header", "api:X Y=KEY"], "<namespace>:"],
    [["--data-json", "api=https://x.example", "--data-json-header", "api:X=1KEY"], "<namespace>:"],
    [
      [
        "--data-json",
        "api=https://x.example",
        "--data-json-header",
        "api:X=K",
        "--data-json-header",
        "api:x=L",
      ],
      "given twice",
    ],
    [
      Array.from({ length: 9 }, (_, i) => ["--data-json", `n${String(i)}=x.json`]).flat(),
      "at most 8",
    ],
  ])("%j is a usage error", (args, message) => {
    expect(usageError(["render", "a.json", ...args]).message).toContain(message);
  });

  test("namespace github clashes with --github, not without it", () => {
    expect(
      usageError(["render", "a.json", "--github", "--data-json", "github=x.json"]).message,
    ).toContain("clashes with --github");
    expect(parseCliArgs(["render", "a.json", "--data-json", "github=x.json"])).toMatchObject({
      dataJson: [{ namespace: "github" }],
    });
  });

  test("combines with --data and with --github", () => {
    expect(
      parseCliArgs(["render", "a.json", "--data", "d.json", "--data-json", "x.json"]),
    ).toMatchObject({ data: "d.json", dataJson: [{ namespace: "json" }] });
    expect(parseCliArgs(["render", "a.json", "--github", "--data-json", "x.json"])).toMatchObject({
      github: true,
      dataJson: [{ namespace: "json" }],
    });
  });

  test("a usage error never quotes the source", () => {
    const message = usageError([
      "render",
      "a.json",
      "--data-json",
      "https://x.example/?key=SECRETKEY",
      "--data-json",
      "https://y.example/?key=SECRETKEY",
    ]).message;
    expect(message).not.toContain("SECRETKEY");
  });
});
