import { GitHubDataError } from "./GitHubDataError.js";
import { requestGitHub, type GitHubRequestContext, type RequestStats } from "./requestGitHub.js";

export const GITHUB_REST_ORIGIN = "https://api.github.com";

/**
 * GETs one REST resource and returns its parsed JSON, unvalidated. The host is fixed and every
 * path segment is encoded, so no value from a response can steer the request elsewhere.
 */
export async function getGitHubJson(
  segments: readonly string[],
  context: GitHubRequestContext,
  stats: RequestStats,
): Promise<{ readonly json: unknown; readonly remaining: number | null }> {
  const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
  const { text, rate } = await requestGitHub(
    { url: `${GITHUB_REST_ORIGIN}/${path}`, body: null, api: "rest" },
    context,
    stats,
  );
  try {
    return { json: JSON.parse(text) as unknown, remaining: rate.remaining };
  } catch {
    throw new GitHubDataError("invalid-response", "The GitHub response is not JSON.");
  }
}
