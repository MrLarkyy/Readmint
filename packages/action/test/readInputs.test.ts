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
      scale: 2,
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
      scale: 2,
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

  test("reads raster formats once each in the listed order, with scale and frame-rate", () => {
    expect(
      readInputs(
        env({ ...base, formats: "webp\n svg, webp,apng", scale: "1.5", "frame-rate": "60" }),
      ),
    ).toMatchObject({ formats: ["webp", "svg", "apng"], scale: 1.5, frameRate: 60 });
    expect(readInputs(env({ ...base, formats: "gif", "frame-rate": "50" })).frameRate).toBe(50);
  });

  test("exclude-repositories takes commas and lines, and not a data-file", () => {
    expect(readInputs(env(base))).not.toHaveProperty("excludeRepositories");
    expect(
      readInputs(env({ ...base, "exclude-repositories": "a, b/c\n d\n\n" })).excludeRepositories,
    ).toEqual(["a", "b/c", "d"]);
    expect(problems({ ...base, "data-file": "d.json", "exclude-repositories": "a" })).toEqual([
      "input exclude-repositories applies to GitHub data only; it cannot go with data-file",
    ]);
  });

  test("language-commit-cap is a whole number 0 to 2000, and not with a data-file", () => {
    expect(readInputs(env(base))).not.toHaveProperty("languageCommitCap");
    expect(readInputs(env({ ...base, "language-commit-cap": "0" }))).not.toHaveProperty(
      "languageCommitCap",
    );
    expect(readInputs(env({ ...base, "language-commit-cap": "300" })).languageCommitCap).toBe(300);
    expect(readInputs(env({ ...base, "language-commit-cap": "2000" })).languageCommitCap).toBe(
      2000,
    );
    for (const bad of ["2001", "-1", "1.5", "many"]) {
      expect(problems({ ...base, "language-commit-cap": bad })).toEqual([
        `input language-commit-cap "${bad}" is not a whole number in 0..2000`,
      ]);
    }
    expect(problems({ ...base, "data-file": "d.json", "language-commit-cap": "5" })).toEqual([
      "input language-commit-cap applies to GitHub data only; it cannot go with data-file",
    ]);
  });

  test("quality is read for webp output and absent by default", () => {
    expect(readInputs(env(base))).not.toHaveProperty("quality");
    expect(readInputs(env({ ...base, formats: "svg, webp", quality: "80" }))).toMatchObject({
      quality: 80,
    });
  });

  test.each(["0", "101", "x", "8.5", "-1"])("quality %s is refused, naming the range", (text) => {
    expect(problems({ ...base, formats: "webp", quality: text })).toEqual([
      `input quality "${text}" is not a whole number in 1..100`,
    ]);
  });

  test("quality without a webp format is refused with the other problems", () => {
    expect(problems({ ...base, formats: "svg, png", quality: "80" })).toEqual([
      "input quality applies to webp output only; formats lists no webp",
    ]);
    expect(problems({ ...base, formats: "svg", quality: "80", scale: "9" })).toEqual([
      'input scale "9" is not a number in 1..4',
      "input quality applies to webp output only; formats lists no webp",
    ]);
  });

  test("an unknown format is refused, naming the formats there are", () => {
    expect(problems({ ...base, formats: "svg,jpeg" })).toEqual([
      'input formats: "jpeg" is not one of svg, png, webp, apng, gif',
    ]);
    expect(problems({ ...base, formats: "SVG" })).toHaveLength(1);
  });

  test("png and apng together are refused: both write <stem>.png", () => {
    expect(problems({ ...base, formats: "png, apng" })).toEqual([
      "input formats lists png and apng, which both write .png files; list one",
    ]);
  });

  test.each([
    [{ scale: "0" }, 'input scale "0" is not a number in 1..4'],
    [{ scale: "4.5" }, 'input scale "4.5" is not a number in 1..4'],
    [{ scale: "two" }, 'input scale "two" is not a number in 1..4'],
    [{ "frame-rate": "0" }, 'input frame-rate "0" is not a whole number in 1..60'],
    [{ "frame-rate": "61" }, 'input frame-rate "61" is not a whole number in 1..60'],
    [{ "frame-rate": "12.5" }, 'input frame-rate "12.5" is not a whole number in 1..60'],
    [
      { formats: "svg,gif", "frame-rate": "51" },
      'input frame-rate "51" is not a whole number in 1..50 (gif)',
    ],
  ])("%j is refused, naming the range", (inputs, message) => {
    expect(problems({ ...base, ...inputs })).toEqual([message]);
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

  test("a branch given as a ref is refused", () => {
    expect(problems({ ...base, branch: "refs/heads/main" })).toEqual([
      'input branch "refs/heads/main" must be a branch name without refs/',
    ]);
  });

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
      formats: "bmp",
      "dry-run": "maybe",
    });
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).not.toContain("ghp_secret");
  });
});

describe("props-file", () => {
  test("is read when given and absent otherwise", () => {
    expect(readInputs(env({ ...base, "props-file": " readmint/settings.json " }))).toMatchObject({
      propsFile: "readmint/settings.json",
    });
    expect(readInputs(env(base))).not.toHaveProperty("propsFile");
  });
});

describe("data-file", () => {
  test.each([
    ["../x.json", "leaves the workspace (..)"],
    ["/tmp/x.json", "is not a relative path"],
    ["C:\\x.json", "is not a relative path"],
  ])("%s is refused naming the input", (dataFile, reason) => {
    expect(problems({ ...base, "data-file": dataFile })).toEqual([
      `input data-file ${JSON.stringify(dataFile)} ${reason}`,
    ]);
  });

  test("a relative path is kept", () => {
    expect(readInputs(env({ ...base, "data-file": "fixtures/d.json" })).dataFile).toBe(
      "fixtures/d.json",
    );
  });
});

describe("data-json", () => {
  test("one source per line, headers attached by namespace", () => {
    const config = readInputs(
      env({
        ...base,
        "data-json": " counts=data/counts.json \n\nhttps://api.example/v1?a=b\n",
        "data-json-headers": "json:X-Api-Key=API_KEY",
      }),
    );
    expect(config.dataJson).toEqual([
      { namespace: "counts", source: "data/counts.json", headers: {} },
      {
        namespace: "json",
        source: "https://api.example/v1?a=b",
        headers: { "x-api-key": "API_KEY" },
      },
    ]);
    expect(readInputs(env(base))).not.toHaveProperty("dataJson");
  });

  test.each([
    ["counts=../outside.json", "leaves the workspace (..)"],
    ["counts=/etc/passwd", "is not a relative path"],
    ["counts=C:\\x.json", "is not a relative path"],
  ])("a file source %j outside the workspace is a problem", (line, reason) => {
    expect(problems({ ...base, "data-json": line })).toEqual([
      `input data-json: the file of namespace counts ${reason}`,
    ]);
  });

  test("namespace github clashes with the GitHub data, not with a data-file", () => {
    expect(problems({ ...base, "data-json": "github=g.json" })).toEqual([
      expect.stringContaining("namespace github clashes with the GitHub data") as string,
    ]);
    expect(
      readInputs(env({ ...base, "data-file": "d.json", "data-json": "github=g.json" })).dataJson,
    ).toEqual([{ namespace: "github", source: "g.json", headers: {} }]);
  });

  test("bad lines are listed with the other problems", () => {
    expect(
      problems({
        ...base,
        scale: "9",
        "data-json": "a=x.json\na=y.json",
        "data-json-headers": "b:X=KEY\nnot a header",
      }),
    ).toEqual([
      'input scale "9" is not a number in 1..4',
      "input data-json: JSON namespace a is given twice",
      "input data-json: a JSON header names namespace b, which has no JSON source",
      "input data-json: a JSON header must be <namespace>:<Header-Name>=<ENV_NAME>",
    ]);
  });
});

describe("data-feed", () => {
  test("one feed per line, limits attached by namespace", () => {
    const config = readInputs(
      env({
        ...base,
        "data-feed": " blog=https://blog.example/feed.xml \n\nhttps://videos.example/feed?id=1\n",
        "data-feed-limits": "feed=10",
      }),
    );
    expect(config.dataFeed).toEqual([
      { namespace: "blog", url: "https://blog.example/feed.xml" },
      { namespace: "feed", url: "https://videos.example/feed?id=1", limit: 10 },
    ]);
    expect(readInputs(env(base))).not.toHaveProperty("dataFeed");
  });

  test("namespace github clashes with the GitHub data, not with a data-file", () => {
    expect(problems({ ...base, "data-feed": "github=https://x.example/f" })).toEqual([
      expect.stringContaining("input data-feed: namespace github clashes") as string,
    ]);
    expect(
      readInputs(env({ ...base, "data-file": "d.json", "data-feed": "github=https://x.example/f" }))
        .dataFeed,
    ).toEqual([{ namespace: "github", url: "https://x.example/f" }]);
  });

  test("a namespace a data-json source has too is a problem naming it", () => {
    expect(
      problems({ ...base, "data-json": "posts=p.json", "data-feed": "posts=https://x.example/f" }),
    ).toEqual([
      "input data-feed: namespace posts is also a data-json namespace; name one of them another namespace",
    ]);
  });

  test("bad lines are listed with the other problems, never quoting a URL", () => {
    const listed = problems({
      ...base,
      "data-feed": "a=http://x.example/?key=SECRETKEY\na=https://y.example/",
      "data-feed-limits": "a=99\nb=2\nnot a limit",
    });
    expect(listed).toEqual([
      "input data-feed: the URL of feed a is not an https URL",
      "input data-feed: feed namespace a is given twice",
      "input data-feed: the limit of feed a must be a whole number from 1 to 50",
      "input data-feed: a feed limit names namespace b, which has no feed",
      "input data-feed: a feed limit must be <namespace>=<n>",
    ]);
    expect(listed.join("\n")).not.toContain("SECRETKEY");
  });
});
