import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { CliCommand } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import type { CliIo } from "./CliIo.js";
import { errnoCode } from "./errnoCode.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { loadRenderInput } from "./loadRenderInput.js";
import { printLines } from "./printLines.js";
import { quoteForLog } from "./quoteForLog.js";
import { renderInput } from "./renderInput.js";

/** Renders the design and writes the SVG exactly as `renderSvg` returned it, to `--out` or standard output. */
export async function renderCommand(
  args: Extract<CliCommand, { name: "render" }>,
  io: CliIo,
): Promise<ExitCode> {
  const input = await loadRenderInput(args, { cwd: io.cwd });
  const name = input.file.name;
  const result = renderInput(input, args);
  if (!result.ok) {
    throw new CliError(
      ExitCode.invalid,
      result.issues.map((issue) => formatIssue(name, issue, "error")),
    );
  }
  await printLines(
    io.stderr,
    result.warnings.map((issue) => formatIssue(name, issue, "warning")),
  );
  if (args.out === undefined) {
    try {
      await io.stdout(result.svg);
    } catch (error) {
      const code = errnoCode(error);
      if (code === undefined) throw error;
      throw new CliError(ExitCode.input, `cannot write standard output (${code})`, {
        cause: error,
      });
    }
    return ExitCode.ok;
  }
  try {
    await writeFile(path.resolve(io.cwd, args.out), result.svg);
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) throw error;
    throw new CliError(ExitCode.input, `cannot write ${quoteForLog(args.out)} (${code})`, {
      cause: error,
    });
  }
  return ExitCode.ok;
}
