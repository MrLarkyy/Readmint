import type { ViewerRecord } from "./GitHubRecords.js";
import { isTokenOwnerLogin } from "./isGitHubLogin.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { ResponseReader } from "./ResponseReader.js";

/** The token's owner: a user login or an app's `…[bot]` login. */
export function parseViewerResponse(data: unknown): ViewerRecord {
  const root = ResponseReader.of(data, "data");
  const login = root.field("viewer").field("login");
  const value = login.string();
  if (!isTokenOwnerLogin(value)) login.fail("a GitHub login");
  return { login: value, rateLimit: parseRateLimitField(root) };
}
