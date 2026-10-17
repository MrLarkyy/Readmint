import { exchange, FIXTURE_LOGIN, successExchanges, type Exchange } from "./replayFetch.js";

/** The author id the fixture profile carries. */
export const AUTHOR_ID = "MDQ6VXNlcjE=";

export const oid = (n: number): string => n.toString(16).padStart(40, "0");

const RATE = { cost: 1, remaining: 4990, resetAt: "2026-10-12T10:00:00Z" };
const GRAPHQL_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-ratelimit-remaining": "4990",
  "x-ratelimit-reset": "1791972000",
};

export interface ContributedNode {
  readonly id: string;
  readonly nameWithOwner: string;
  readonly isFork?: boolean;
  readonly isPrivate?: boolean;
}

export interface HistoryCommit {
  readonly oid: string;
  readonly date: string;
  readonly parents?: number;
}

export interface HistoryRepository {
  readonly id: string;
  readonly nameWithOwner: string;
  readonly commits: readonly HistoryCommit[];
}

export function contributedExchange(nodes: readonly ContributedNode[]): Exchange {
  return {
    request: { operation: "ReadmintContributed", variables: { login: FIXTURE_LOGIN } },
    status: 200,
    headers: GRAPHQL_HEADERS,
    body: {
      data: {
        user: {
          repositoriesContributedTo: {
            nodes: nodes.map((node) => ({
              isFork: false,
              isPrivate: false,
              ...node,
            })),
          },
        },
        rateLimit: RATE,
      },
    },
  };
}

export function historyExchange(repositories: readonly HistoryRepository[]): Exchange {
  return {
    request: {
      operation: "ReadmintAuthoredHistory",
      variables: { ids: repositories.map((repository) => repository.id), author: AUTHOR_ID },
    },
    status: 200,
    headers: GRAPHQL_HEADERS,
    body: {
      data: {
        nodes: repositories.map((repository) => ({
          id: repository.id,
          nameWithOwner: repository.nameWithOwner,
          defaultBranchRef: {
            target: {
              history: {
                nodes: repository.commits.map((commit) => ({
                  oid: commit.oid,
                  committedDate: commit.date,
                  parents: { totalCount: commit.parents ?? 1 },
                })),
              },
            },
          },
        })),
        rateLimit: RATE,
      },
    },
  };
}

export function commitUrl(nameWithOwner: string, sha: string): string {
  return `https://api.github.com/repos/${nameWithOwner}/commits/${sha}`;
}

export function commitExchange(
  nameWithOwner: string,
  sha: string,
  files: readonly [string, number][],
  overrides: { status?: number; remaining?: number; body?: unknown } = {},
): Exchange {
  return {
    request: { operation: "GET", variables: {}, url: commitUrl(nameWithOwner, sha) },
    status: overrides.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-ratelimit-remaining": String(overrides.remaining ?? 4000),
      "x-ratelimit-reset": "1791972000",
      "x-ratelimit-resource": "core",
    },
    body: overrides.body ?? {
      sha,
      files: files.map(([filename, additions]) => ({ filename, additions })),
    },
  };
}

/**
 * Three repositories the fixture user committed to (a fork and an excluded one are listed too):
 * `monolith` is TypeScript by bytes but the user's lines there are small, `app` is Kotlin.
 * Commits, newest first: app 1 (Kotlin 100), monolith 2 (TypeScript 10 + excluded files),
 * app 3 (Kotlin 80, Java 20), a merge, app 5 (Kotlin 60).
 */
export function authoredScenario() {
  const contributed = contributedExchange([
    { id: "R_mono", nameWithOwner: "readmint-fixture/monolith" },
    { id: "R_app", nameWithOwner: "readmint-fixture/app" },
    { id: "R_fork", nameWithOwner: "someone/forked", isFork: true },
    { id: "R_skip", nameWithOwner: "readmint-fixture/skipped" },
  ]);
  const history = historyExchange([
    {
      id: "R_app",
      nameWithOwner: "readmint-fixture/app",
      commits: [
        { oid: oid(1), date: "2026-10-05T10:00:00Z" },
        { oid: oid(3), date: "2026-10-03T10:00:00Z" },
        { oid: oid(4), date: "2026-10-02T10:00:00Z", parents: 2 },
        { oid: oid(5), date: "2026-10-01T10:00:00Z" },
      ],
    },
    {
      id: "R_mono",
      nameWithOwner: "readmint-fixture/monolith",
      commits: [{ oid: oid(2), date: "2026-10-04T10:00:00Z" }],
    },
  ]);
  const commits = [
    commitExchange("readmint-fixture/app", oid(1), [["src/Main.kt", 100]]),
    commitExchange("readmint-fixture/monolith", oid(2), [
      ["src/index.ts", 10],
      ["dist/bundle.js", 5000],
      ["package-lock.json", 9000],
      ["logo.png", 1],
      ["README.md", 40],
    ]),
    commitExchange("readmint-fixture/app", oid(3), [
      ["app/Build.kts", 80],
      ["app/Legacy.java", 20],
    ]),
    commitExchange("readmint-fixture/app", oid(5), [["src/Util.kt", 60]]),
  ];
  return { contributed, history, commits };
}

/** The viewer answer, the fixture user's pages and activity, then the authored exchanges. */
export function authoredExchanges(
  viewer: Exchange,
  commits = authoredScenario().commits,
): Exchange[] {
  const { contributed, history } = authoredScenario();
  return [viewer, ...successExchanges(), contributed, history, ...commits];
}

export const viewerExchange = (): Exchange => exchange("viewer");
