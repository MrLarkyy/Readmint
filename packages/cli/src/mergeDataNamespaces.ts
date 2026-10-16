import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";

/**
 * Fixture data with the namespaces a source loaded added; a namespace in both is `CliError` (exit code 3) naming it,
 * never one silently replacing the other.
 */
export function mergeDataNamespaces(
  fixture: Readonly<Record<string, unknown>>,
  loaded: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const clash = Object.keys(loaded).find((key) => Object.hasOwn(fixture, key));
  if (clash !== undefined) {
    throw new CliError(
      ExitCode.input,
      `data namespace ${clash} is in the fixture data and loaded by a data source; rename one`,
    );
  }
  return Object.fromEntries([...Object.entries(fixture), ...Object.entries(loaded)]);
}
