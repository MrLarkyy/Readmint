import type { ViewerRecord } from "./GitHubRecords.js";
import { isGitHubLogin } from "./isGitHubLogin.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { ResponseReader } from "./ResponseReader.js";

export function parseViewerResponse(data: unknown): ViewerRecord {
  const root = ResponseReader.of(data, "data");
  const login = root.field("viewer").field("login");
  const value = login.string();
  if (!isGitHubLogin(value)) login.fail("a GitHub login");
  return { login: value, rateLimit: parseRateLimitField(root) };
}
