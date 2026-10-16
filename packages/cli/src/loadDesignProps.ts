import { type DesignProps, DesignLimits, parseDesignProps } from "@readmint/format";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { quoteForLog } from "./quoteForLog.js";
import { readUserFile } from "./readUserFile.js";

// Every UTF-16 unit of the largest source the format takes is at most 3 UTF-8 bytes; plus a byte order mark.
const maxPropsBytes = 3 * DesignLimits.maxSourceLength + 3;

/**
 * Reads a settings file (`--props`, `props-file`): JSON, root props by section. A local file of the user's, so not
 * confined to a folder. Throws `CliError`: exit code 3 when it cannot be read, 1 when its content is invalid; a
 * message names the file and the pointer, never a value.
 */
export async function loadDesignProps(propsPath: string, cwd: string): Promise<DesignProps> {
  const file = quoteForLog(propsPath);
  const bytes = await readUserFile("settings file", propsPath, cwd, maxPropsBytes);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CliError(
      ExitCode.invalid,
      `settings file ${file}: error parse at /: not valid UTF-8`,
    );
  }
  const result = parseDesignProps(source);
  if (result.ok) return result.value;
  const lines = result.issues.map((issue) => formatIssue(`settings file ${file}`, issue, "error"));
  if (result.truncated) lines.push(`settings file ${file}: more issues not shown`);
  throw new CliError(ExitCode.invalid, lines);
}
