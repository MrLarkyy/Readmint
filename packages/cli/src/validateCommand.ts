import type { CliCommand } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import type { CliIo } from "./CliIo.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { imageFetching } from "./imageFetching.js";
import { liveData } from "./liveData.js";
import { loadRenderInput } from "./loadRenderInput.js";
import { printLines } from "./printLines.js";
import { renderInput } from "./renderInput.js";

/**
 * Checks the design and loads its assets; with data (`--data`, `--github`, `--data-json`, `--data-feed`, `--data-wakatime` or `--data-registry`) also renders it (output discarded),
 * since without data every binding would fail.
 */
export async function validateCommand(
  args: Extract<CliCommand, { name: "validate" }>,
  io: CliIo,
): Promise<ExitCode> {
  const input = await loadRenderInput(args, {
    cwd: io.cwd,
    ...liveData(args, io),
    ...imageFetching(args, io),
  });
  const name = input.file.name;
  if (input.data !== undefined) {
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
  }
  await printLines(io.stdout, [`${name}: ok`]);
  return ExitCode.ok;
}
