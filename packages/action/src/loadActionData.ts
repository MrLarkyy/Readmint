import { CliError, loadFixtureData } from "@readmint/cli";
import {
  GITHUB_DATA_NAMESPACE,
  GitHubDataError,
  type GitHubFetch,
  loadGitHubData,
} from "@readmint/data-github";
import type { ActionConfig } from "./ActionConfig.js";
import { ActionError } from "./ActionError.js";

/** How long one GitHub load may take in total, retries and rate-limit waits included. */
export const githubLoadTimeoutMs = 300_000;

/**
 * The data every design of the run reads, loaded once: the fixture file of `data-file` (no token,
 * no GitHub API), else the GitHub data of `login` bound as `{ github: data }`. A failure becomes
 * `ActionError` (data) carrying the loader's message only: `GitHubDataError` keeps no cause and
 * redacts the token, `CliError` names the file and the reason.
 */
export async function loadActionData(
  config: ActionConfig,
  workspace: string,
  fetch?: GitHubFetch,
): Promise<Record<string, unknown>> {
  if (config.dataFile !== undefined) {
    try {
      return await loadFixtureData(config.dataFile, workspace);
    } catch (error) {
      if (error instanceof CliError) throw new ActionError("data", error.lines);
      throw error;
    }
  }
  try {
    const result = await loadGitHubData({
      token: config.token,
      ...(config.login === "" ? {} : { login: config.login }),
      signal: AbortSignal.timeout(githubLoadTimeoutMs),
      ...(fetch === undefined ? {} : { fetch }),
    });
    return { [GITHUB_DATA_NAMESPACE]: result.data };
  } catch (error) {
    if (error instanceof GitHubDataError) {
      throw new ActionError("data", `GitHub data (${error.code}): ${error.message}`);
    }
    throw error;
  }
}
