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
import { renderOutput } from "./renderOutput.js";

/**
 * Renders the design and writes the SVG exactly as `renderSvg` returned it, to `--out` or standard output, or a
 * raster image of it to `--out`. The file is written only once the whole output is made: a failed export leaves
 * `--out` as it was.
 */
export async function renderCommand(
  args: Extract<CliCommand, { name: "render" }>,
  io: CliIo,
): Promise<ExitCode> {
  const input = await loadRenderInput(args, { cwd: io.cwd });
  const name = input.file.name;
  const result = await renderOutput(input, [args.format], {
    ...(args.locale === undefined ? {} : { locale: args.locale }),
    ...(args.time === undefined ? {} : { time: args.time }),
    ...(args.scale === undefined ? {} : { scale: args.scale }),
    ...(args.frameRate === undefined ? {} : { frameRate: args.frameRate }),
  });
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
  const [output] = result.outputs;
  if (output === undefined) throw new Error("render produced no output");
  if (args.out === undefined) {
    await io.stdout(new TextDecoder().decode(output.bytes));
    return ExitCode.ok;
  }
  try {
    await writeFile(path.resolve(io.cwd, args.out), output.bytes);
  } catch (error) {
    const code = errnoCode(error);
    if (code === undefined) throw error;
    throw new CliError(ExitCode.input, `cannot write ${quoteForLog(args.out)} (${code})`, {
      cause: error,
    });
  }
  return ExitCode.ok;
}
