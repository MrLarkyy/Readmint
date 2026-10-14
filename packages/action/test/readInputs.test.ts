import { describe, expect, test } from "vitest";
import { ActionError, readInputs } from "../src/index.js";

function env(inputs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(inputs).map(([name, value]) => [`INPUT_${name.toUpperCase()}`, value]),
  );
}

function problems(inputs: Record<string, string>): readonly string[] {
  try {
    readInputs(env(inputs));
  } catch (error) {
    if (error instanceof ActionError && error.kind === "input") return error.lines;
    throw error;
  }
  throw new Error("readInputs accepted the inputs");
}

const base = { designs: "card.json", token: "t0ken-value" };

describe("readInputs", () => {
  test("applies the action.yml defaults", () => {
    expect(readInputs(env(base))).toEqual({
      designs: ["card.json"],
      outputDir: "readmint",
      formats: ["svg"],
      token: "t0ken-value",
      login: "",
      commitMessage: "Update Readmint graphics",
      dryRun: false,
    });
  });

  test("blank values take the default; lines are trimmed and blank lines dropped", () => {
    const config = readInputs(
      env({
        ...base,
        designs: "\n  a/card.json \r\n\n b.yaml\n",
        "output-dir": "  ",
        "commit-message": " ",
        "dry-run": "",
      }),
    );
    expect(config).toMatchObject({
      designs: ["a/card.json", "b.yaml"],
      outputDir: "readmint",
      commitMessage: "Update Readmint graphics",
      dryRun: false,
    });
  });

  test("reads every input", () => {
    const config = readInputs(
      env({
        designs: "card.json",
        "output-dir": "./images/readme/",
        formats: "svg, svg",
        token: "unused",
        login: "octocat",
        "data-file": "fixture.json",
        locale: "de-AT",
        "commit-message": "chore: graphics",
        branch: "feature/readme",
        "dry-run": "True",
      }),
    );
    expect(config).toEqual({
      designs: ["card.json"],
      outputDir: "images/readme",
      formats: ["svg"],
      token: "",
      login: "octocat",
      dataFile: "fixture.json",
      locale: "de-AT",
      commitMessage: "chore: graphics",
      branch: "feature/readme",
      dryRun: true,
    });
  });

  test.each(["true", "True", "TRUE", "false", "False", "FALSE"])(
    "dry-run %s is a boolean",
    (text) => {
      expect(readInputs(env({ ...base, "dry-run": text })).dryRun).toBe(
        text.toLowerCase() === "true",
      );
    },
  );

  test.each(["yes", "1", "on", "tRUE"])("dry-run %s is refused", (text) => {
    expect(problems({ ...base, "dry-run": text })).toEqual([
      `input dry-run "${text}" is not true or false`,
    ]);
  });

  test("formats other than svg are refused until raster export", () => {
    expect(problems({ ...base, formats: "svg,png" })).toEqual([
      'input formats: "png" is not supported; only svg until raster export',
    ]);
    expect(problems({ ...base, formats: "SVG" })).toHaveLength(1);
  });

  test("an empty design list is refused", () => {
    expect(problems({ ...base, designs: "\n \n" })).toEqual(["input designs lists no design file"]);
  });

  test("more than 64 designs are refused", () => {
    const designs = Array.from({ length: 65 }, (_, i) => `d${String(i)}.json`).join("\n");
    expect(problems({ ...base, designs })).toEqual(["input designs lists 65 files; at most 64"]);
    expect(() =>
      readInputs(env({ ...base, designs: designs.split("\n").slice(1).join("\n") })),
    ).not.toThrow();
  });

  test.each([
    ["/etc/card.json", "is not a relative path"],
    ["C:/card.json", "is not a relative path"],
    ["a/../../card.json", "leaves the workspace (..)"],
    ["..\\card.json", "leaves the workspace (..)"],
  ])("design %s is refused", (design, reason) => {
    expect(problems({ ...base, designs: design })).toEqual([
      `design ${JSON.stringify(design)} ${reason}`,
    ]);
  });

  test.each([
    ["..", "leaves the workspace (..)"],
    ["/tmp/out", "is not a relative path"],
    ["out/../../x", "leaves the workspace (..)"],
    [".git/hooks", "is inside the .git folder"],
    ["./.GIT", "is inside the .git folder"],
  ])("output-dir %s is refused", (dir, reason) => {
    expect(problems({ ...base, "output-dir": dir })).toEqual([
      `input output-dir ${JSON.stringify(dir)} ${reason}`,
    ]);
  });

  test.each(["-x", "a..b", "a b", "a:b", "x.lock", "a/.b", "a//b", "@", "a@{1}", "a~1", "end/"])(
    "branch %s is refused",
    (branch) => {
      expect(problems({ ...base, branch })).toEqual([
        `input branch ${JSON.stringify(branch)} is not a valid branch name`,
      ]);
    },
  );

  test("a locale that is not a BCP 47 tag is refused", () => {
    expect(problems({ ...base, locale: "en_US!" })).toEqual([
      'input locale "en_US!" is not a BCP 47 language tag',
    ]);
  });

  test("a locale the expression tables lack is refused as by readmint render --locale", () => {
    expect(problems({ ...base, locale: "pl" })).toEqual([
      'input locale "pl" is not supported (supported: en, de, fr, es, cs)',
    ]);
    expect(problems({ ...base, locale: "cs-CZ-u-nu-latn-ca-gregory-hc-h23-x-foo" })).toHaveLength(
      1,
    );
    expect(readInputs(env({ ...base, locale: "cs-CZ" })).locale).toBe("cs-CZ");
  });

  test("a commit message over 4096 characters is refused", () => {
    expect(problems({ ...base, "commit-message": "x".repeat(4097) })).toEqual([
      "input commit-message is longer than 4096 characters",
    ]);
    expect(
      readInputs(env({ ...base, "commit-message": "x".repeat(4096) })).commitMessage,
    ).toHaveLength(4096);
  });

  test("a missing token without data-file is refused, without a data-file the token is kept", () => {
    expect(problems({ designs: "card.json" })).toEqual([
      "input token is empty; pass a token or a data-file",
    ]);
    expect(readInputs(env({ designs: "card.json", "data-file": "d.json" })).token).toBe("");
  });

  test("lists every problem at once and never quotes the token", () => {
    const lines = problems({
      designs: "",
      token: "ghp_secretsecretsecret",
      formats: "gif",
      "dry-run": "maybe",
    });
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).not.toContain("ghp_secret");
  });
});
