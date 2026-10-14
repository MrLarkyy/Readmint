import { readFile } from "node:fs/promises";
import { AssetPathError } from "./AssetPathError.js";
import { CliError } from "./CliError.js";
import type { CliIo } from "./CliIo.js";
import { errnoCode } from "./errnoCode.js";
import { ExitCode } from "./ExitCode.js";
import { helpText } from "./helpText.js";
import { parseCliArgs } from "./parseCliArgs.js";
import { previewCommand } from "./previewCommand.js";
import { printLines } from "./printLines.js";
import { renderCommand } from "./renderCommand.js";
import { validateCommand } from "./validateCommand.js";

/**
 * Runs one `readmint` command line (without node and the script) against `io` and returns the
 * exit code; never throws. Every message line is escaped (`escapeForLog`); the SVG is written as is.
 * A system error writing standard output (EPIPE, a full disk) is exit code 3 for every command.
 */
export async function runCli(argv: readonly string[], cliIo: CliIo): Promise<ExitCode> {
  const io: CliIo = { ...cliIo, stdout: guardStdout(cliIo.stdout) };
  try {
    const command = parseCliArgs(argv);
    switch (command.name) {
      case "help":
        await io.stdout(helpText);
        return ExitCode.ok;
      case "version":
        await printLines(io.stdout, [await packageVersion()]);
        return ExitCode.ok;
      case "render":
        return await renderCommand(command, io);
      case "validate":
        return await validateCommand(command, io);
      case "preview":
        return await previewCommand(command, io);
    }
  } catch (error) {
    return report(error, io);
  }
}

function guardStdout(write: CliIo["stdout"]): CliIo["stdout"] {
  return async (text) => {
    try {
      await write(text);
    } catch (error) {
      const code = errnoCode(error);
      if (code === undefined) throw error;
      throw new CliError(ExitCode.input, `cannot write standard output (${code})`, {
        cause: error,
      });
    }
  };
}

async function report(error: unknown, io: CliIo): Promise<ExitCode> {
  const [exitCode, lines] =
    error instanceof CliError
      ? [error.exitCode, error.lines]
      : error instanceof AssetPathError
        ? [ExitCode.invalid, [error.message]]
        : [
            ExitCode.internal,
            [`internal error: ${error instanceof Error ? error.message : String(error)}`],
          ];
  try {
    await printLines(io.stderr, lines);
  } catch {
    // standard error is closed too (a broken pipe): the computed code still says what happened
  }
  return exitCode;
}

async function packageVersion(): Promise<string> {
  const text = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const { version } = JSON.parse(text) as { version?: unknown };
  return typeof version === "string" ? version : "unknown";
}
