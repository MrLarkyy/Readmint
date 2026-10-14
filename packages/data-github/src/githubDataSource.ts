import { DATA_SOURCE_INTERFACE_VERSION, type DataSource } from "@readmint/data";
import { GITHUB_DATA_NAMESPACE, GITHUB_DATA_VERSION, type GitHubData } from "./GitHubData.js";
import type { GitHubLoadMeta } from "./GitHubLoadResult.js";
import type { GitHubSourceOptions } from "./GitHubSourceOptions.js";
import { loadGitHubData } from "./loadGitHubData.js";

/** The GitHub source as a `@readmint/data` plugin; `loadGitHubData` is its implementation. */
export const githubDataSource: DataSource<GitHubSourceOptions, GitHubData, GitHubLoadMeta> =
  Object.freeze({
    interfaceVersion: DATA_SOURCE_INTERFACE_VERSION,
    namespace: GITHUB_DATA_NAMESPACE,
    dataVersion: GITHUB_DATA_VERSION,
    load: loadGitHubData,
  });
