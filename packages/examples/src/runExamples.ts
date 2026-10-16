import { buildExamples } from "./buildExamples.js";
import { compareExamples } from "./compareExamples.js";
import { defaultActionRef } from "./defaultActionRef.js";
import { profileExampleProps } from "./profileExampleProps.js";
import { writeExamples } from "./writeExamples.js";

export interface ExamplesIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const usage = `usage: readmint-examples <templates dir> <examples repository dir> [--check] [--login MrLarkyy] [--action ${defaultActionRef}]\n`;

/** The command line of `readmint-examples` without process wiring; returns the exit code (0, 1 out of sync or failed, 2 usage). */
export function runExamples(argv: readonly string[], io: ExamplesIo): number {
  const fail = (message: string): number => {
    io.stderr(`${message === "" ? "" : `${message}\n`}${usage}`);
    return 2;
  };
  const positional: string[] = [];
  let check = false;
  let login = "MrLarkyy";
  let actionRef = defaultActionRef;
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
  try {
    const files = buildExamples(templatesDir, { login, actionRef, props: profileExampleProps });
    if (!check) {
      const { written, removed } = writeExamples(out, files);
      io.stdout(`wrote ${String(written)} files to ${out}, removed ${String(removed.length)}\n`);
      return 0;
    }
    const differences = compareExamples(out, files);
    for (const { path, kind } of differences) io.stdout(`${kind}: ${path}\n`);
    if (differences.length === 0) {
      io.stdout("the examples repository is in sync\n");
      return 0;
    }
    io.stderr(`${String(differences.length)} files out of sync; run without --check to update\n`);
    return 1;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
