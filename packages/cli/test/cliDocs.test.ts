import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import * as cli from "../src/index.js";
import { ExitCode, outputFormats } from "../src/index.js";
import { helpText } from "../src/helpText.js";
import { parseCliArgs } from "../src/parseCliArgs.js";

const docs = readFileSync(join(import.meta.dirname, "..", "..", "..", "docs", "cli.md"), "utf8");

function section(heading: string): string {
  const start = docs.indexOf(`\n## ${heading}\n`);
  expect(start, heading).toBeGreaterThan(-1);
  const end = docs.indexOf("\n## ", start + 1);
  return docs.slice(start, end === -1 ? undefined : end);
}

test("the exit-code table of docs/cli.md is ExitCode", () => {
  const rows = [...section("Exit codes").matchAll(/^\| (\d+) +\| `(\w+)` +\|/gm)];
  const documented: Record<string, number> = Object.fromEntries(
    rows.map(([, code, name]) => [name ?? "", Number(code)] as const),
  );
  expect(documented).toEqual({ ...ExitCode });
});

test("--help lists the same exit codes", () => {
  const line = helpText.split("\n").find((text) => text.startsWith("Exit codes:")) ?? "";
  const codes = [...line.matchAll(/(\d+) /g)].map(([, code]) => Number(code));
  expect(codes).toEqual(Object.values(ExitCode));
});

test("--help and docs/cli.md name every output format", () => {
  for (const format of outputFormats) {
    expect(helpText).toContain(format);
    expect(section("Options")).toContain("`" + format + "`");
  }
  expect(helpText).not.toContain("SVG only");
  expect(docs).not.toContain("SVG only");
});

test("--help and docs/cli.md list the same options", () => {
  const helpOptions = [...helpText.matchAll(/^ {2}(?:-h, )?(--[a-z-]+)/gm)].map(([, name]) => name);
  const docOptions = [...docs.matchAll(/^\| `(--[a-z-]+)/gm)].map(([, name]) => name);
  expect(helpOptions).toContain("--frame-rate");
  expect(new Set(helpOptions)).toEqual(new Set([...docOptions, "--help", "--version"]));
});

test("the Preview section names --open", () => {
  expect(section("Preview")).toContain("--open");
});

test("docs/cli.md or docs/asset-loading.md names every export of @readmint/cli", () => {
  const assetDocs = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "docs", "asset-loading.md"),
    "utf8",
  );
  const names = Object.keys(cli).filter((name) => name !== "packageName");
  const missing = names.filter(
    (name) => !docs.includes(`\`${name}`) && !assetDocs.includes(`\`${name}`),
  );
  expect(missing).toEqual([]);
});

test("--help and docs/cli.md name every --out extension that picks a raster format", () => {
  for (const extension of [".png", ".apng", ".webp", ".gif"]) {
    expect(helpText).toContain(extension);
    expect(section("Options")).toContain("`" + extension + "`");
    const command = parseCliArgs(["render", "d.json", "--out", `a${extension}`]);
    expect(command.name === "render" ? command.format : "").not.toBe("svg");
  }
});
