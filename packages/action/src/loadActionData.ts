import { CliError, loadFixtureData, loadLiveData } from "@readmint/cli";
import type { GitHubFetch, GitHubPartialPart } from "@readmint/data-github";
import type { ActionConfig } from "./ActionConfig.js";
import { ActionError } from "./ActionError.js";

/**
 * The data every design of the run reads, loaded once: the fixture file of `data-file` (no token,
 * no GitHub API), else the GitHub data of `login` bound as `{ github: data }` by `loadLiveData`, the
 * load `readmint --github` uses. A failure becomes `ActionError` (data) carrying the loader's lines
 * only: `CliError` holds `GitHub data (<code>): <redacted message>` or names the file and the reason.
 */
export async function loadActionData(
  config: ActionConfig,
  workspace: string,
  fetch?: GitHubFetch,
  onPartial?: (parts: readonly GitHubPartialPart[]) => void,
): Promise<Record<string, unknown>> {
  try {
    if (config.dataFile !== undefined) return await loadFixtureData(config.dataFile, workspace);
    return await loadLiveData({
      token: config.token,
      ...(config.login === "" ? {} : { login: config.login }),
      ...(fetch === undefined ? {} : { fetch }),
      ...(onPartial === undefined ? {} : { onPartial }),
    });
  } catch (error) {
    if (error instanceof CliError) throw new ActionError("data", error.lines);
    throw error;
  }
}
