import path from "node:path";
import { DataSourceError, isDataNamespace } from "@readmint/data";
import { workspaceFileReader } from "@readmint/data-json/node";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { quoteForLog } from "./quoteForLog.js";
import { readUserFile } from "./readUserFile.js";

/** Largest fixture data file in bytes. */
export const maxFixtureBytes = 8 * 1024 * 1024;

/** `confinedTo`: a folder the file must stay inside (relative path, links resolved), as the Action's `data-file`. */
export interface FixtureDataOptions {
  readonly confinedTo?: string;
}

/**
 * Reads fixture data: a JSON object whose keys are data namespaces (`isDataNamespace`), as the
 * data sources would provide it. By default a local file of the user's, so not confined to a
 * folder (`--data`); with `confinedTo` it must be a relative path that stays inside that folder
 * after links are resolved. No network, no token. Throws `CliError` (exit code 3) naming the file
 * and the reason, never the JSON parser's message (it quotes the data) nor the folder.
 */
export async function loadFixtureData(
  dataPath: string,
  cwd: string,
  options?: FixtureDataOptions,
): Promise<Record<string, unknown>> {
  const bytes =
    options?.confinedTo === undefined
      ? await readUserFile("fixture data", dataPath, cwd, maxFixtureBytes)
      : await readConfined(dataPath, options.confinedTo);
  return parseFixtureData(dataPath, bytes);
}

async function readConfined(dataPath: string, root: string): Promise<Uint8Array> {
  try {
    return await workspaceFileReader(path.resolve(root))(dataPath, maxFixtureBytes);
  } catch (error) {
    if (!(error instanceof DataSourceError)) throw error;
    const prefix = `The JSON file ${JSON.stringify(dataPath)} `;
    const message = error.message.endsWith(".") ? error.message.slice(0, -1) : error.message;
    const reason = message.startsWith(prefix) ? message.slice(prefix.length) : message;
    throw new CliError(ExitCode.input, `fixture data ${quoteForLog(dataPath)} ${reason}`);
  }
}

function parseFixtureData(dataPath: string, bytes: Uint8Array): Record<string, unknown> {
  const fail = (reason: string): never => {
    throw new CliError(ExitCode.input, `fixture data ${quoteForLog(dataPath)} ${reason}`);
  };
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail("is not valid UTF-8 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("must be a JSON object of data namespaces");
  }
  for (const key of Object.keys(value)) {
    if (!isDataNamespace(key)) {
      return fail(
        `has the key ${quoteForLog(key)}, which is not a data namespace (a lowercase letter, then up to 31 lowercase letters or digits)`,
      );
    }
  }
  return value as Record<string, unknown>;
}
