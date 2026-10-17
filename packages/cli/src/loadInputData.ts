import type { DesignArgs } from "./CliCommand.js";
import { loadFixtureData } from "./loadFixtureData.js";
import { mergeDataNamespaces } from "./mergeDataNamespaces.js";

/**
 * The data of a run: the fixture file `args.data` and, when `loadData` is given, the namespaces it loads added to the
 * fixture; `undefined` when there is neither.
 */
export async function loadInputData(
  args: Pick<DesignArgs, "data">,
  options: {
    readonly cwd: string;
    readonly loadData?: () => Promise<Record<string, unknown>>;
  },
): Promise<Record<string, unknown> | undefined> {
  const fixture =
    args.data === undefined ? undefined : await loadFixtureData(args.data, options.cwd);
  if (options.loadData === undefined) return fixture;
  const loaded = await options.loadData();
  return fixture === undefined ? loaded : mergeDataNamespaces(fixture, loaded);
}
