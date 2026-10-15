import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "./buildExamples.js";

const generatedRoot = ["README.md", ".github/workflows/readmint.yml"];

/**
 * The existing files of the examples repository that the generator owns: the root README and workflow, and of every
 * folder with a `designs/` its `designs/` and `README.md`. Never `<template>/readmint/`, `.git` or anything else.
 */
export function generatedFiles(out: string): string[] {
  if (!existsSync(out)) return [];
  const found = generatedRoot.filter((path) => existsSync(join(out, path)));
  for (const name of readdirSync(out).sort()) {
    const dir = join(out, name);
    if (name.startsWith(".") || !statSync(dir).isDirectory() || !existsSync(join(dir, "designs"))) {
      continue;
    }
    if (existsSync(join(dir, "README.md"))) found.push(`${name}/README.md`);
    found.push(...listFiles(join(dir, "designs")).map((path) => `${name}/designs/${path}`));
  }
  return found.sort();
}
