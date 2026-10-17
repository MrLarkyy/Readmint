import { type DesignProps, DesignLimits, parseDesignProps } from "@readmint/format";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { quoteForLog } from "./quoteForLog.js";
import { readConfinedFile } from "./readConfinedFile.js";
import { readUserFile } from "./readUserFile.js";

// Every UTF-16 unit of the largest source the format takes is at most 3 UTF-8 bytes; plus a byte order mark.
const maxPropsBytes = 3 * DesignLimits.maxSourceLength + 3;

/** `confinedTo`: a folder the file must stay inside (relative path, links resolved), as the Action's `props-file`. */
export interface DesignPropsOptions {
  readonly confinedTo?: string;
}

/**
 * Reads a settings file (`--props`, `props-file`): JSON, root props by section. By default a local file of the
 * user's, so not confined to a folder (`--props`); with `confinedTo` it must be a relative path that stays inside
 * that folder after links are resolved (the Action). Throws `CliError`: exit code 3 when it cannot be read, 1 when its content is invalid; a
 * message names the file and the pointer, never a value.
 */
export async function loadDesignProps(
  propsPath: string,
  cwd: string,
  options?: DesignPropsOptions,
): Promise<DesignProps> {
  const file = quoteForLog(propsPath);
  const bytes =
    options?.confinedTo === undefined
      ? await readUserFile("settings file", propsPath, cwd, maxPropsBytes)
      : await readConfinedFile("settings file", propsPath, options.confinedTo, maxPropsBytes);
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
