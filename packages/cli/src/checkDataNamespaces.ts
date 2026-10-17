import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { letNamesOf } from "./letNamesOf.js";
import type { DesignFile } from "./loadDesignFile.js";
import type { DataFeedSpec } from "./parseDataFeedArgs.js";
import type { DataJsonSpec } from "./parseDataJsonArgs.js";

const maxLines = 10;

/**
 * Fails before any data is loaded when a `--data-json` or `--data-feed` namespace equals a `let` name of the design:
 * a `let` never hides a data name, so the render would fail anyway, after the requests. Names only in the lines.
 */
export function checkDataNamespaces(
  file: DesignFile,
  json: readonly DataJsonSpec[],
  feed: readonly DataFeedSpec[],
): void {
  const options = new Map<string, string>();
  for (const spec of feed) options.set(spec.namespace, "--data-feed");
  for (const spec of json) options.set(spec.namespace, "--data-json");
  if (options.size === 0) return;
  const clashes = letNamesOf(file.design).filter(({ name }) => options.has(name));
  if (clashes.length === 0) return;
  const lines = clashes.slice(0, maxLines).map(({ name, path }) => {
    const option = options.get(name) ?? "";
    const message = `let name "${name}" is also the namespace of ${option} "${name}"; rename the let name or give the source another namespace (${option} <ns>=<source>)`;
    return formatIssue(file.name, { path, code: "binding", message }, "error");
  });
  if (clashes.length > maxLines) lines.push(`${file.name}: more issues not shown`);
  throw new CliError(ExitCode.invalid, lines);
}
