#!/usr/bin/env node
import { buildExamples } from "./buildExamples.js";
import { compareExamples } from "./compareExamples.js";
import { profileExampleProps } from "./profileExampleProps.js";
import { writeExamples } from "./writeExamples.js";

const usage =
  "usage: readmint-examples <templates dir> <examples repository dir> [--check] [--login MrLarkyy] [--action MrLarkyy/Readmint@v0.1.0]\n";

function fail(message: string): number {
  process.stderr.write(`${message === "" ? "" : `${message}\n`}${usage}`);
  return 2;
}

function main(argv: readonly string[]): number {
  const positional: string[] = [];
  let check = false;
  let login = "MrLarkyy";
  let actionRef = "MrLarkyy/Readmint@v0.1.0";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--check") check = true;
    else if (arg === "--login" || arg === "--action") {
      const value = argv[++i];
      if (value === undefined) return fail(`${arg} needs a value`);
      if (arg === "--login") login = value;
      else actionRef = value;
    } else if (arg.startsWith("--")) return fail(`unknown option ${arg}`);
    else positional.push(arg);
  }
  const [templatesDir, out] = positional;
  if (templatesDir === undefined || out === undefined || positional.length > 2) return fail("");
  const files = buildExamples(templatesDir, { login, actionRef, props: profileExampleProps });
  if (!check) {
    const { written, removed } = writeExamples(out, files);
    process.stdout.write(
      `wrote ${String(written)} files to ${out}, removed ${String(removed.length)}\n`,
    );
    return 0;
  }
  const differences = compareExamples(out, files);
  for (const { path, kind } of differences) process.stdout.write(`${kind}: ${path}\n`);
  if (differences.length === 0) {
    process.stdout.write("the examples repository is in sync\n");
    return 0;
  }
  process.stderr.write(
    `${String(differences.length)} files out of sync; run without --check to update\n`,
  );
  return 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
