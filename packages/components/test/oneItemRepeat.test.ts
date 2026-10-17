import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const templates = join(import.meta.dirname, "..", "templates");

/** Whether a `repeat.each` binding is an array literal of exactly one element, which a `let` entry says better. */
function isOneElementLiteral(each: unknown): boolean {
  if (typeof each !== "string") return false;
  const match = /^\{\{\s*([\s\S]*?)\s*\}\}$/.exec(each);
  const source = match?.[1] ?? "";
  if (!source.startsWith("[") || !source.endsWith("]")) return false;
  let depth = 0;
  let quote: string | undefined;
  let commas = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source.charAt(i);
    if (quote !== undefined) {
      if (char === "\\") i++;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") quote = char;
    else if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) {
      depth--;
      if (depth === 0 && i < source.length - 1) return false;
    } else if (char === "," && depth === 1) commas++;
  }
  return depth === 0 && quote === undefined && commas === 0 && source.slice(1, -1).trim() !== "";
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(path);
    return entry.name.endsWith(".json") ? [path] : [];
  });
}

/** The paths of the layers whose `repeat.each` is a one-element array literal. */
function oneItemRepeats(node: unknown, path = ""): string[] {
  if (Array.isArray(node))
    return node.flatMap((child, index) => oneItemRepeats(child, `${path}/${String(index)}`));
  if (node === null || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  const repeat = record["repeat"];
  const own =
    repeat !== null &&
    typeof repeat === "object" &&
    isOneElementLiteral((repeat as Record<string, unknown>)["each"])
      ? [path]
      : [];
  return [
    ...own,
    ...Object.entries(record).flatMap(([key, child]) => oneItemRepeats(child, `${path}/${key}`)),
  ];
}

describe("one-item repeats", () => {
  test.each([
    ["{{ [x] }}", true],
    ["{{ [[1, 2]] }}", true],
    ["{{ [f(a, b)] }}", true],
    ['{{ ["a,b"] }}', true],
    ["{{ [a, b] }}", false],
    ["{{ [a][0] }}", false],
    ["{{ items }}", false],
    ["{{ [] }}", false],
    [3, false],
  ])("detects %j as %s", (each, expected) => {
    expect(isOneElementLiteral(each)).toBe(expected);
  });

  test("no shipped template binds a value with a one-item repeat", () => {
    const found = jsonFiles(templates).flatMap((file) =>
      oneItemRepeats(JSON.parse(readFileSync(file, "utf8")) as unknown).map(
        (path) => `${relative(templates, file)}${path}`,
      ),
    );
    expect(found, "use a layer `let` instead of a one-item repeat").toEqual([]);
  });
});
