import { GitHubDataError } from "./GitHubDataError.js";
import { requestGitHub, type GitHubRequestContext, type RequestStats } from "./requestGitHub.js";

export const GITHUB_REST_ORIGIN = "https://api.github.com";

/**
 * GETs one REST resource and returns its parsed JSON, unvalidated. The host is fixed, every path
 * segment is encoded and an empty, `.` or `..` segment is refused (encoding leaves dots alone and
 * a client would resolve them), so no value from a response can steer the request elsewhere.
 */
export async function getGitHubJson(
  segments: readonly string[],
  context: GitHubRequestContext,
  stats: RequestStats,
): Promise<{ readonly json: unknown; readonly remaining: number | null }> {
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new GitHubDataError("invalid-response", "A GitHub path segment is not a name.");
  }
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
