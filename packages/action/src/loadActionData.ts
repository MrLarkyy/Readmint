import {
  checkFixtureNamespaces,
  CliError,
  loadFeedArgs,
  loadFixtureData,
  loadJsonArgs,
  loadLiveData,
  loadRegistryArgs,
  loadWakaTimeArgs,
  mergeDataNamespaces,
} from "@readmint/cli";
import type { GitHubFetch, GitHubPartialPart } from "@readmint/data-github";
import type { ActionConfig } from "./ActionConfig.js";
import { ActionError } from "./ActionError.js";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The data every design of the run reads, loaded once: the fixture file of `data-file` (confined to
 * the workspace like the `data-json` files; no token, no GitHub API), else the GitHub data of `login` bound as `{ github: data }` by `loadLiveData`, the
 * load `readmint --github` uses; then each `data-json` source in order (`loadJsonArgs`, files
 * confined to the workspace, header values from `env`), then each `data-feed` feed in order
 * (`loadFeedArgs`), then each `data-wakatime` source in order (`loadWakaTimeArgs`, the key read from the variable of
 * `env` the line names; a still-calculating answer goes to `onWakaTimePartial`), then each `data-registry` namespace
 * (`loadRegistryArgs`, no key; unknown entries go to `onRegistryMissing`), added to it. `config.cacheDir`
 * (absolute) lets the GitHub, WakaTime and registry loads keep their answers. A failure becomes `ActionError` (data) carrying the loader's
 * lines only: `CliError` holds `GitHub data (<code>): <redacted message>`, `JSON data <ns>
 * (<code>): <message>`, `Feed data <ns> (<code>): <message>` (never the URL), `WakaTime data <ns> (<code>):
 * <message>`, `Registry data <ns> (<code>): <message>` or the variable a WakaTime source lacks (never a key), or names the file
 * and the reason.
 */
export async function loadActionData(
  config: ActionConfig,
  workspace: string,
  fetch?: GitHubFetch,
  onPartial?: (parts: readonly GitHubPartialPart[]) => void,
  env: Env = {},
  onWakaTimePartial?: (namespace: string) => void,
  onRegistryMissing?: (namespace: string, missing: readonly string[]) => void,
): Promise<Record<string, unknown>> {
  try {
    const base =
      config.dataFile !== undefined
        ? await loadFixtureData(config.dataFile, workspace, { confinedTo: workspace })
        : await loadLiveData({
            token: config.token,
            ...(config.login === "" ? {} : { login: config.login }),
            ...(config.excludeRepositories === undefined
              ? {}
              : { excludeRepositories: config.excludeRepositories }),
            ...(config.languageCommitCap === undefined
              ? {}
              : { languageCommitCap: config.languageCommitCap }),
            ...(config.cacheDir === undefined ? {} : { cacheDir: config.cacheDir }),
            ...(fetch === undefined ? {} : { fetch }),
            ...(onPartial === undefined ? {} : { onPartial }),
          });
    if (config.dataFile !== undefined) {
      // A data-file key equal to a source namespace fails before any of the sources sends a request.
      checkFixtureNamespaces(
        base,
        [
          ...(config.dataJson ?? []),
          ...(config.dataFeed ?? []),
          ...(config.dataWakaTime ?? []),
          ...(config.dataRegistry ?? []),
        ].map((spec) => spec.namespace),
      );
    }
    const json =
      config.dataJson === undefined
        ? {}
        : await loadJsonArgs(config.dataJson, {
            root: workspace,
            fetch: fetch ?? globalThis.fetch,
            env,
          });
    const feed =
      config.dataFeed === undefined
        ? {}
        : await loadFeedArgs(config.dataFeed, { fetch: fetch ?? globalThis.fetch });
    const wakaTime =
      config.dataWakaTime === undefined
        ? {}
        : await loadWakaTimeArgs(config.dataWakaTime, {
            fetch: fetch ?? globalThis.fetch,
            env,
            ...(config.cacheDir === undefined ? {} : { cacheDir: config.cacheDir }),
            ...(onWakaTimePartial === undefined ? {} : { onPartial: onWakaTimePartial }),
          });
    const registry =
      config.dataRegistry === undefined
        ? {}
        : await loadRegistryArgs(config.dataRegistry, {
            fetch: fetch ?? globalThis.fetch,
            ...(config.cacheDir === undefined ? {} : { cacheDir: config.cacheDir }),
            ...(onRegistryMissing === undefined ? {} : { onMissing: onRegistryMissing }),
          });
    // readInputs refuses a namespace two of these sources take: they never clash.
    return mergeDataNamespaces(base, { ...json, ...feed, ...wakaTime, ...registry });
  } catch (error) {
    if (error instanceof CliError) throw new ActionError("data", error.lines);
    throw error;
  }
}
