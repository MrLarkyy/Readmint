import { describe, expect, test } from "vitest";
import { languagesAuthored } from "../src/languagesAuthored.js";
import { parseCommitFiles } from "../src/parseCommitFiles.js";

describe("languagesAuthored", () => {
  test("shares are additions over the total, most first", () => {
    const result = languagesAuthored(
      new Map([
        ["Java", 100],
        ["Kotlin", 300],
      ]),
    );
    expect(result).toEqual([
      { name: "Kotlin", color: "#A97BFF", share: 0.75, additions: 300 },
      { name: "Java", color: "#b07219", share: 0.25, additions: 100 },
    ]);
  });

  test("equal additions are ordered by name, whatever the insertion order", () => {
    const forward = languagesAuthored(
      new Map([
        ["Go", 5],
        ["Dart", 5],
        ["Lua", 5],
      ]),
    );
    const backward = languagesAuthored(
      new Map([
        ["Lua", 5],
        ["Dart", 5],
        ["Go", 5],
      ]),
    );
    expect(forward.map((entry) => entry.name)).toEqual(["Dart", "Go", "Lua"]);
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });

  test("no added line gives an empty list", () => {
    expect(languagesAuthored(new Map())).toEqual([]);
    expect(languagesAuthored(new Map([["Kotlin", 0]]))).toEqual([]);
  });

  test("a name outside the table is dropped", () => {
    expect(languagesAuthored(new Map([["Nope", 5]]))).toEqual([]);
  });
});

describe("parseCommitFiles", () => {
  test("sums by language and skips excluded and unknown files", () => {
    const sums = parseCommitFiles({
      files: [
        { filename: "a/A.kt", additions: 3 },
        { filename: "a/B.kt", additions: 4 },
        { filename: "dist/x.js", additions: 100 },
        { filename: "notes.md", additions: 100 },
        { filename: "c/C.java", additions: 1 },
      ],
    });
    expect([...sums]).toEqual([
      ["Kotlin", 7],
      ["Java", 1],
    ]);
  });

  test("a commit without files adds nothing", () => {
    expect(parseCommitFiles({ sha: "x" }).size).toBe(0);
  });

  test("only the first 300 files count", () => {
    const files = Array.from({ length: 400 }, (_, index) => ({
      filename: `f${String(index)}.kt`,
      additions: 1,
    }));
    expect(parseCommitFiles({ files }).get("Kotlin")).toBe(300);
  });

  test("a path at the string limit is skipped", () => {
    const long = `${"d/".repeat(600)}a.kt`;
    expect(parseCommitFiles({ files: [{ filename: long, additions: 9 }] }).size).toBe(0);
  });

  test.each([
    ["not an object", 5],
    ["files not an array", { files: 3 }],
    ["additions negative", { files: [{ filename: "a.kt", additions: -1 }] }],
    ["additions a string", { files: [{ filename: "a.kt", additions: "1" }] }],
    ["filename missing", { files: [{ additions: 1 }] }],
  ])("%s is a malformed response", (_name, body) => {
    expect(() => parseCommitFiles(body)).toThrow(/Unexpected GitHub response/);
  });
});
