import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { expect, test } from "vitest";

const packageDir = join(import.meta.dirname, "..");
const sourceDir = join(packageDir, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(dir, entry.name)]
        : [],
  );
}

test("src imports no Node builtin and touches no Node global, so the browser runs it unchanged", () => {
  const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
  const files = sourceFiles(sourceDir);
  expect(files.length).toBeGreaterThan(10);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/from\s+"(?<specifier>[^"]+)"/gu)) {
      const specifier = match.groups?.["specifier"] ?? "";
      expect(
        builtins.has(specifier) || specifier.startsWith("node:"),
        `${file}: ${specifier}`,
      ).toBe(false);
    }
    expect(text, file).not.toMatch(
      /\b(?:process|Buffer|require|__dirname)\b|\beval\(|new Function/u,
    );
  }
});

test("yaml is the only runtime dependency", () => {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as Record<
    string,
    Record<string, string> | undefined
  >;
  expect(Object.keys(manifest["dependencies"] ?? {})).toEqual(["yaml"]);
  expect(manifest["peerDependencies"]).toBeUndefined();
  expect(manifest["optionalDependencies"]).toBeUndefined();
});
