import { expect, test } from "vitest";
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
