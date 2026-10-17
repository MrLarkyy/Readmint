import { GitHubDataError } from "./GitHubDataError.js";
import { isJsonRecord, ownField, type JsonRecord } from "./jsonRecord.js";
import type { RateLimitHeaders } from "./readRateLimit.js";
import { redactSecret } from "./redactSecret.js";
import {
  primaryLimit,
  requestGitHub,
  type GitHubRequestContext,
  type RequestStats,
} from "./requestGitHub.js";

export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

export interface GraphQLOperation {
  readonly operationName: string;
  readonly query: string;
}

export type GraphQLVariables = Readonly<Record<string, string | number | readonly string[] | null>>;

export type GraphQLContext = GitHubRequestContext;

const MAX_REPORTED_ERRORS = 3;
const MAX_ERROR_MESSAGE = 200;

/**
 * Sends one GraphQL operation and returns its `data` object, unvalidated. The token goes only
 * into the `Authorization` header; the query and variables only into the body.
 */
export async function postGraphQL(
  operation: GraphQLOperation,
  variables: GraphQLVariables,
  context: GraphQLContext,
  stats: RequestStats,
): Promise<JsonRecord> {
  const body = JSON.stringify({
    query: operation.query,
    operationName: operation.operationName,
    variables,
  });
  const { text, rate } = await requestGitHub(
    { url: GITHUB_GRAPHQL_URL, body, api: "graphql" },
    context,
    stats,
  );
  return readGraphQLData(text, rate, context.token);
}

function readGraphQLData(text: string, rate: RateLimitHeaders, token: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GitHubDataError("invalid-response", "The GitHub response is not JSON.");
  }
  if (!isJsonRecord(parsed)) {
    throw new GitHubDataError("invalid-response", "The GitHub response is not a JSON object.");
  }
  const errors = ownField(parsed, "errors");
  if (errors !== undefined && errors !== null) {
    if (!Array.isArray(errors)) {
      throw new GitHubDataError("invalid-response", "The GitHub response has malformed errors.");
    }
    if (errors.length > 0) throw graphQLFailure(errors, rate, token);
  }
  const data = ownField(parsed, "data");
  if (!isJsonRecord(data)) {
    throw new GitHubDataError("invalid-response", "The GitHub response has no data.");
  }
  return data;
}

function graphQLFailure(
  errors: readonly unknown[],
  rate: RateLimitHeaders,
  token: string,
): GitHubDataError {
  const types = errors.map(errorType);
  if (types.includes("RATE_LIMITED")) return primaryLimit(rate, 200);
  if (types.every((type) => type === "NOT_FOUND")) {
    return new GitHubDataError("not-found", "GitHub has no user with that login.");
  }
  const reported = errors.slice(0, MAX_REPORTED_ERRORS);
  const summary = reported
    .map((entry, index) => `${types[index] ?? "UNKNOWN"}: ${errorMessage(entry, token)}`)
    .join("; ");
  const more =
    errors.length > reported.length ? ` (+${String(errors.length - reported.length)})` : "";
  return new GitHubDataError("graphql", `GitHub GraphQL error: ${summary}${more}`, {
    secret: token,
  });
}

function errorType(entry: unknown): string {
  const type = isJsonRecord(entry) ? ownField(entry, "type") : undefined;
  return typeof type === "string" && /^[A-Z_]{1,40}$/.test(type) ? type : "UNKNOWN";
}

function errorMessage(entry: unknown, token: string): string {
  const message = isJsonRecord(entry) ? ownField(entry, "message") : undefined;
  if (typeof message !== "string") return "(no message)";
  // Redact before cutting, so a cut cannot leave a token fragment the patterns miss.
  // eslint-disable-next-line no-control-regex
  const clean = redactSecret(message, token).replace(/[\u0000-\u001f\u007f]/g, " ");
  return clean.length > MAX_ERROR_MESSAGE ? `${clean.slice(0, MAX_ERROR_MESSAGE)}…` : clean;
}
