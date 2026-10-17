import path from "node:path";
import { DataSourceError } from "@readmint/data";
import { workspaceFileReader } from "@readmint/data-json/node";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { quoteForLog } from "./quoteForLog.js";

/**
 * Reads a file that must be a relative path staying inside `root` after links are resolved. Throws `CliError`
 * (exit code 3) as `<label> <quoted path> <reason>`, never naming `root`.
 */
export async function readConfinedFile(
  label: string,
  filePath: string,
  root: string,
  maxBytes: number,
): Promise<Uint8Array> {
  try {
    return await workspaceFileReader(path.resolve(root))(filePath, maxBytes);
  } catch (error) {
    if (!(error instanceof DataSourceError)) throw error;
    const prefix = `The JSON file ${JSON.stringify(filePath)} `;
    const message = error.message.endsWith(".") ? error.message.slice(0, -1) : error.message;
    const reason = message.startsWith(prefix) ? message.slice(prefix.length) : message;
    throw new CliError(ExitCode.input, `${label} ${quoteForLog(filePath)} ${reason}`);
  }
}
