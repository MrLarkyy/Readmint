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
  checkFixtureNamespaces(fixture, Object.keys(loaded));
  return Object.fromEntries([...Object.entries(fixture), ...Object.entries(loaded)]);
}

/**
 * The clash `mergeDataNamespaces` refuses, checked against the namespaces the sources are going to load, so a fixture
 * key equal to one fails before any request.
 */
export function checkFixtureNamespaces(
  fixture: Readonly<Record<string, unknown>>,
  namespaces: readonly string[],
): void {
  const clash = namespaces.find((key) => Object.hasOwn(fixture, key));
  if (clash !== undefined) {
    throw new CliError(
      ExitCode.input,
      `data namespace ${clash} is in the fixture data and loaded by a data source; rename one`,
    );
  }
}
