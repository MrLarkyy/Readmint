import {
  CliError,
  loadFeedArgs,
  loadFixtureData,
  loadJsonArgs,
  loadLiveData,
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
 * (`loadFeedArgs`), added to it. A failure becomes `ActionError` (data) carrying the loader's
 * lines only: `CliError` holds `GitHub data (<code>): <redacted message>`, `JSON data <ns>
 * (<code>): <message>`, `Feed data <ns> (<code>): <message>` (never the URL) or names the file
 * and the reason.
 */
export async function loadActionData(
  config: ActionConfig,
  workspace: string,
  fetch?: GitHubFetch,
  onPartial?: (parts: readonly GitHubPartialPart[]) => void,
  env: Env = {},
): Promise<Record<string, unknown>> {
  try {
    const base =
      config.dataFile !== undefined
        ? await loadFixtureData(config.dataFile, workspace, { confinedTo: workspace })
        : await loadLiveData({
            token: config.token,
            ...(config.login === "" ? {} : { login: config.login }),
            ...(fetch === undefined ? {} : { fetch }),
            ...(onPartial === undefined ? {} : { onPartial }),
          });
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
    // readInputs refuses a namespace both a JSON source and a feed take: the two never clash.
    return mergeDataNamespaces(base, { ...json, ...feed });
  } catch (error) {
    if (error instanceof CliError) throw new ActionError("data", error.lines);
    throw error;
  }
}
