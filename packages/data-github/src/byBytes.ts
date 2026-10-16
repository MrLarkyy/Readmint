import { compareText } from "./compareText.js";
import type { GitHubRepositoryLanguage } from "./GitHubData.js";

export function byBytes(left: GitHubRepositoryLanguage, right: GitHubRepositoryLanguage): number {
  return right.bytes - left.bytes || compareText(left.name, right.name);
}
