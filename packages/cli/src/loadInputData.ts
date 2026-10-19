import type { DesignArgs } from "./CliCommand.js";
import { loadFixtureData } from "./loadFixtureData.js";
import { checkFixtureNamespaces, mergeDataNamespaces } from "./mergeDataNamespaces.js";
import { sourceNamespaces } from "./sourceNamespaces.js";

/**
 * The data of a run: the fixture file `args.data` and, when `loadData` is given, the namespaces it loads added to the
 * fixture; `undefined` when there is neither. A fixture key equal to a namespace of `args` (`--github`, `--data-json`,
 * `--data-feed`, `--data-wakatime`, `--data-registry`) fails before `loadData` sends any request.
 */
export async function loadInputData(
  args: Pick<
    DesignArgs,
    "data" | "github" | "dataJson" | "dataFeed" | "dataWakaTime" | "dataRegistry"
  >,
  options: {
    readonly cwd: string;
    readonly loadData?: () => Promise<Record<string, unknown>>;
  },
): Promise<Record<string, unknown> | undefined> {
  const fixture =
    args.data === undefined ? undefined : await loadFixtureData(args.data, options.cwd);
  if (options.loadData === undefined) return fixture;
  if (fixture !== undefined) checkFixtureNamespaces(fixture, sourceNamespaces(args));
  const loaded = await options.loadData();
  return fixture === undefined ? loaded : mergeDataNamespaces(fixture, loaded);
}
