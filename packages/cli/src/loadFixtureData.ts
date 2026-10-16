import { isDataNamespace } from "@readmint/data";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { quoteForLog } from "./quoteForLog.js";
import { readUserFile } from "./readUserFile.js";

/** Largest fixture data file in bytes. */
export const maxFixtureBytes = 8 * 1024 * 1024;

/**
 * Reads fixture data: a JSON object whose keys are data namespaces (`isDataNamespace`), as the
 * data sources would provide it. A local file of the user's, so not confined to a folder; no
 * network, no token. Throws `CliError` (exit code 3) naming the file and the reason, never the
 * JSON parser's message (it quotes the data).
 */
export async function loadFixtureData(
  dataPath: string,
  cwd: string,
): Promise<Record<string, unknown>> {
  const fail = (reason: string): never => {
    throw new CliError(ExitCode.input, `fixture data ${quoteForLog(dataPath)} ${reason}`);
  };
  const bytes = await readUserFile("fixture data", dataPath, cwd, maxFixtureBytes);
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
