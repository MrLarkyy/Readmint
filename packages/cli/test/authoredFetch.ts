import { fixtureBody } from "./githubFetch.js";

const RATE = { cost: 1, remaining: 4990, resetAt: "2026-10-12T10:00:00Z" };
const bodyByOperation: Readonly<Record<string, string>> = {
  ReadmintViewer: "viewer",
  ReadmintProfile: "profile",
  ReadmintRepositories: "repositories-3",
  ReadmintActivity: "activity",
  ReadmintWeeks: "weeks",
};

const sha = (n: number): string => n.toString(16).padStart(40, "0");

export interface AuthoredFetch {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Every request URL, in order. */
  readonly urls: string[];
  /** The REST commit URLs only. */
  rest(): string[];
}

/** A GitHub with one repository of `commitCount` Kotlin commits (newest first) answering GraphQL and REST. */
export function authoredFetch(commitCount = 8): AuthoredFetch {
  const urls: string[] = [];
  const fetch = (url: string, init: RequestInit): Promise<Response> => {
    urls.push(url);
    if (url.includes("/repos/")) {
      return Promise.resolve(
        Response.json({ sha: url.slice(-40), files: [{ filename: "src/Main.kt", additions: 10 }] }),
      );
    }
    const sent = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
      operationName?: string;
    };
    const operation = sent.operationName ?? "";
    if (operation === "ReadmintContributed") {
      return Promise.resolve(
        Response.json({
          data: {
            user: {
              repositoriesContributedTo: {
                nodes: [
                  {
                    id: "R_app",
                    nameWithOwner: "readmint-fixture/app",
                    isFork: false,
                    isPrivate: false,
                  },
                ],
              },
            },
            rateLimit: RATE,
          },
        }),
      );
    }
    if (operation === "ReadmintAuthoredHistory") {
      const nodes = Array.from({ length: commitCount }, (_, index) => ({
        oid: sha(index + 1),
        committedDate: `2026-10-${String(20 - index).padStart(2, "0")}T10:00:00Z`,
        parents: { totalCount: 1 },
      }));
      return Promise.resolve(
        Response.json({
          data: {
            nodes: [
              {
                id: "R_app",
                nameWithOwner: "readmint-fixture/app",
                defaultBranchRef: { target: { history: { nodes } } },
              },
            ],
            rateLimit: RATE,
          },
        }),
      );
    }
    return Promise.resolve(Response.json(fixtureBody(bodyByOperation[operation] ?? "viewer")));
  };
  return { fetch, urls, rest: () => urls.filter((url) => url.includes("/repos/")) };
}
