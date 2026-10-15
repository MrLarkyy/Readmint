import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parse } from "yaml";
import config from "../rolldown.config.js";
import { ActionInputs, ActionOutputs } from "../src/index.js";

interface ActionYml {
  inputs: Record<string, { required?: boolean; default?: string; description?: string }>;
  outputs: Record<string, { description?: string }>;
  runs: { using: string; main: string };
}

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const yml = parse(readFileSync(join(repoRoot, "action.yml"), "utf8")) as ActionYml;

test("action.yml declares exactly the inputs of ActionInputs, with their defaults", () => {
  expect(Object.keys(yml.inputs)).toEqual(Object.keys(ActionInputs));
  for (const [name, input] of Object.entries(ActionInputs)) {
    const declared = yml.inputs[name];
    expect(declared?.required, name).toBe(input.required);
    expect(declared?.default ?? "", name).toBe(input.default);
    expect(declared?.description, name).toBeTruthy();
  }
});

test("action.yml declares exactly the outputs the Action writes", () => {
  expect(Object.keys(yml.outputs)).toEqual([...ActionOutputs]);
});

test("action.yml runs the bundle on node24", () => {
  const output = Array.isArray(config.output) ? undefined : config.output;
  expect(yml.runs).toEqual({ using: "node24", main: `packages/action/${output?.file ?? ""}` });
});

test("docs/action.md documents exactly these inputs and outputs", () => {
  const docs = readFileSync(join(repoRoot, "docs", "action.md"), "utf8");
  const section = (heading: string): string => {
    const start = docs.indexOf(`\n## ${heading}\n`);
    expect(start, heading).toBeGreaterThan(-1);
    const end = docs.indexOf("\n## ", start + 1);
    return docs.slice(start, end === -1 ? undefined : end);
  };
  const names = (heading: string) =>
    [...section(heading).matchAll(/^\| `([a-z-]+)` +\|/gm)].map(([, name]) => name);
  expect(names("Inputs")).toEqual(Object.keys(ActionInputs));
  expect(names("Outputs")).toEqual([...ActionOutputs]);
});
