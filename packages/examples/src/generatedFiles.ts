import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assertNoLink } from "./assertNoLink.js";
import { listFiles } from "./listFiles.js";

const rootFolders = [".github", ".github/workflows"];
const rootFiles = ["README.md", ".github/workflows/readmint.yml"];

/** Whether `path` exists (a link counts), after refusing a link. */
function existsUnlinked(path: string): boolean {
  if (!existsSync(path) && !isLink(path)) return false;
  assertNoLink(path);
  return true;
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * The existing files of the examples repository that the generator owns: the root README and workflow, and of every
 * folder with a `designs/` its `designs/` and `README.md`. Never `<template>/readmint/`, `.git` or anything else.
 * A symbolic link on any of these paths, or a top-level folder that is one, throws before anything is touched.
 */
export function generatedFiles(out: string): string[] {
  if (!existsSync(out)) return [];
  for (const path of rootFolders) existsUnlinked(join(out, path));
  const found = rootFiles.filter((path) => existsUnlinked(join(out, path)));
  for (const name of readdirSync(out).sort()) {
    if (name.startsWith(".")) continue;
    const dir = join(out, name);
    assertNoLink(dir);
    if (!lstatSync(dir).isDirectory() || !existsUnlinked(join(dir, "designs"))) continue;
    if (existsUnlinked(join(dir, "README.md"))) found.push(`${name}/README.md`);
    found.push(...listFiles(join(dir, "designs")).map((path) => `${name}/designs/${path}`));
  }
  return found.sort();
}
