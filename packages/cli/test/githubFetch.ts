import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ImageFetch } from "../src/index.js";
import { png } from "./cliTree.js";

/** A planted token: shaped like a classic personal access token, never a real one. */
export const CANARY = "ghp_CANARYrm39CANARYrm39CANARYrm39CANA";

const fixtures = join(import.meta.dirname, "..", "..", "data-github", "test", "fixtures");

export function fixtureBody(name: string): unknown {
  return (JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8")) as { body: unknown })
    .body;
}

const bodyByOperation: Readonly<Record<string, string>> = {
  ReadmintViewer: "viewer",
  ReadmintProfile: "profile",
  ReadmintRepositories: "repositories-3",
  ReadmintActivity: "activity",
  ReadmintWeeks: "weeks",
};

export interface SentRequest {
  readonly url: string;
  readonly init: RequestInit;
  /** The GraphQL operation, `undefined` for an image request. */
  readonly operation?: string;
  readonly variables?: Record<string, unknown>;
}

export interface GitHubReplay {
  readonly fetch: ImageFetch;
  readonly requests: SentRequest[];
  /** The GraphQL requests only. */
  graphql(): SentRequest[];
}

/**
 * A fetch answering the GraphQL API from the data-github fixtures (viewer, profile, the last repository page) and
 * any other URL with a PNG; `answer` replaces the GraphQL answer when given.
 */
export function githubReplay(
  answer?: (url: string, init: RequestInit) => Promise<Response>,
): GitHubReplay {
  const requests: SentRequest[] = [];
  const fetch: ImageFetch = (url, init) => {
    if (url !== "https://api.github.com/graphql") {
      requests.push({ url, init });
      return Promise.resolve(new Response(new Uint8Array(png), { status: 200 }));
    }
    const sent = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
      operationName?: string;
      variables?: Record<string, unknown>;
    };
    const operation = sent.operationName ?? "";
    requests.push({ url, init, operation, variables: sent.variables ?? {} });
    if (answer !== undefined) return answer(url, init);
    return Promise.resolve(
      Response.json(fixtureBody(bodyByOperation[operation] ?? "viewer"), { status: 200 }),
    );
  };
  return {
    fetch,
    requests,
    graphql: () => requests.filter((request) => request.operation !== undefined),
  };
}

/** A GitHub that echoes the Authorization header back in its error message. */
export const echoing =
  (status: number) =>
  (_url: string, init: RequestInit): Promise<Response> =>
    Promise.resolve(
      Response.json(
        { message: `bad ${new Headers(init.headers).get("authorization") ?? ""}` },
        { status },
      ),
    );

/** The forms of `secret` no output may hold: as is, base64, and the base64 of the git basic credential. */
export function secretForms(secret: string): string[] {
  const base64 = (value: string) => Buffer.from(value, "utf8").toString("base64");
  return [secret, base64(secret), base64(`x-access-token:${secret}`)];
}
