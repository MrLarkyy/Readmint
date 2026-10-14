import { describe, expect, test } from "vitest";
import {
  GitHubDataError,
  GitHubLimits,
  loadGitHubData,
  type GitHubFetch,
  type GitHubLoadResult,
} from "../src/index.js";
import {
  item,
  withCalendar,
  withRepositories,
  withUser,
  type FixtureRepository,
} from "./fixtureBodies.js";
import {
  exchange,
  FIXTURE_LOGIN,
  replayFetch,
  successExchanges,
  type Exchange,
} from "./replayFetch.js";

function load(fetch: GitHubFetch): Promise<GitHubLoadResult> {
  return loadGitHubData({ token: "test-token", login: FIXTURE_LOGIN, pageSize: 2, fetch });
}

async function failure(exchanges: readonly Exchange[]): Promise<GitHubDataError> {
  const error: unknown = await load(replayFetch(exchanges).fetch).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof GitHubDataError)) throw new Error("expected a GitHubDataError");
  return error;
}

/** The success exchanges with the first repository of the first page changed. */
function firstRepositoryWith(mutate: (node: FixtureRepository) => void): Exchange[] {
  const changed = withRepositories(exchange("repositories-1"), (connection) => {
    mutate(item(connection.nodes, 0));
  });
  return [exchange("profile"), changed, exchange("repositories-2"), exchange("repositories-3")];
}

const profile = () => exchange("profile");

describe("invalid responses fail with invalid-response and the JSON path", () => {
  const cases: [string, Exchange[], string][] = [
    [
      "a string count",
      [
        withUser(profile(), (user) => {
          user.followers.totalCount = "42";
        }),
      ],
      "data.user.followers.totalCount",
    ],
    [
      "a missing field",
      [
        withUser(profile(), (user) => {
          delete user.createdAt;
        }),
      ],
      "data.user.createdAt",
    ],
    [
      "a negative count",
      firstRepositoryWith((node) => {
        node.stargazerCount = -1;
      }),
      "data.user.repositories.nodes[0].stargazerCount",
    ],
    [
      "a fractional count",
      firstRepositoryWith((node) => {
        node.forkCount = 1.5;
      }),
      "data.user.repositories.nodes[0].forkCount",
    ],
    [
      "a bad date",
      [
        withCalendar(profile(), (calendar) => {
          item(item(calendar.weeks, 1).contributionDays, 0).date = "2025-02-30";
        }),
      ],
      "data.user.contributionsCollection.contributionCalendar.weeks[1].contributionDays[0].date",
    ],
    [
      "a bad timestamp",
      [
        withUser(profile(), (user) => {
          user.createdAt = "2019-04-01 08:30";
        }),
      ],
      "data.user.createdAt",
    ],
    [
      "a gap in the calendar",
      [
        withCalendar(profile(), (calendar) => {
          item(calendar.weeks, 10).contributionDays.splice(3, 1);
        }),
      ],
      "contributionCalendar.weeks",
    ],
    [
      "a weekday that disagrees with the date",
      [
        withCalendar(profile(), (calendar) => {
          item(item(calendar.weeks, 5).contributionDays, 2).weekday = 4;
        }),
      ],
      "weeks[5].contributionDays[2].weekday",
    ],
    [
      "a total that is not the sum of the days",
      [
        withCalendar(profile(), (calendar) => {
          calendar.totalContributions += 1;
        }),
      ],
      "contributionCalendar.totalContributions",
    ],
    [
      "an unknown contribution level",
      [
        withCalendar(profile(), (calendar) => {
          item(item(calendar.weeks, 3).contributionDays, 1).contributionLevel = "FIFTH_QUARTILE";
        }),
      ],
      "weeks[3].contributionDays[1].contributionLevel",
    ],
    [
      "an empty calendar",
      [
        withCalendar(profile(), (calendar) => {
          calendar.weeks = [];
          calendar.totalContributions = 0;
        }),
      ],
      "contributionCalendar.weeks",
    ],
    [
      "too many weeks",
      [
        withCalendar(profile(), (calendar) => {
          calendar.weeks.push({ contributionDays: [] });
        }),
      ],
      "contributionCalendar.weeks",
    ],
    [
      "a javascript: repository URL",
      firstRepositoryWith((node) => {
        node.url = "javascript:alert(1)";
      }),
      "data.user.repositories.nodes[0].url",
    ],
    [
      "a plain-http avatar",
      [
        withUser(profile(), (user) => {
          user.avatarUrl = "http://avatars.example.com/u/1";
        }),
      ],
      "data.user.avatarUrl",
    ],
    [
      "a string over the length cap",
      [
        withUser(profile(), (user) => {
          user.bio = "b".repeat(GitHubLimits.maxStringLength + 1);
        }),
      ],
      "data.user.bio",
    ],
    [
      "more nodes than requested",
      [
        profile(),
        withRepositories(exchange("repositories-1"), (connection) => {
          connection.nodes.push(structuredClone(item(connection.nodes, 0)));
        }),
      ],
      "data.user.repositories.nodes",
    ],
  ];

  test.each(cases)("%s", async (_name, exchanges, path) => {
    const error = await failure(exchanges);
    expect(error.code).toBe("invalid-response");
    expect(error.message).toContain(path);
  });

  test("a count of 1e400 (Infinity after parsing) is invalid", async () => {
    const source = profile();
    const text = JSON.stringify(source.body).replace('"totalCount":42', '"totalCount":1e400');
    expect(text).toContain("1e400");
    const error = await failure([{ ...source, body: text }]);
    expect(error.code).toBe("invalid-response");
    expect(error.message).toContain("data.user.followers.totalCount");
  });
});

describe("hostile values are neutralised", () => {
  test("a colour that would break out of an attribute becomes null", async () => {
    const hostile = '#fff"/><script>alert(1)</script>';
    const exchanges = firstRepositoryWith((node) => {
      node.primaryLanguage.color = hostile;
      item(node.languages.edges, 0).node.color = hostile;
    });
    const { data } = await load(replayFetch(exchanges).fetch);
    const readmint = data.repositories.find((repository) => repository.name === "readmint");
    expect(readmint?.primaryLanguage?.color).toBeNull();
    expect(readmint?.languages[0]?.color).toBeNull();
    expect(JSON.stringify(data)).not.toContain("<script>");
  });

  test("a user-entered link that is not https becomes null", async () => {
    const exchanges = firstRepositoryWith((node) => {
      node.homepageUrl = "javascript:alert(1)";
    });
    exchanges[0] = withUser(profile(), (user) => {
      user.websiteUrl = "example.com";
    });
    const { data } = await load(replayFetch(exchanges).fetch);
    expect(data.websiteUrl).toBeNull();
    const readmint = data.repositories.find((repository) => repository.name === "readmint");
    expect(readmint?.homepageUrl).toBeNull();
  });

  test("__proto__ keys pollute nothing and are not copied", async () => {
    const source = profile();
    const text = JSON.stringify(source.body)
      .replace('"user":{', '"user":{"__proto__":{"polluted":true,"login":"evil"},')
      .replace('"data":{', '"data":{"__proto__":{"polluted":true},');
    const pages = successExchanges().slice(1);
    const { data } = await load(replayFetch([{ ...source, body: text }, ...pages]).fetch);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
    expect(data.login).toBe(FIXTURE_LOGIN);
    expect(JSON.stringify(data)).not.toContain("polluted");
  });
});

describe("body size", () => {
  test("a declared content-length over the cap is too-large", async () => {
    const source = profile();
    const oversized = {
      ...source,
      headers: { ...source.headers, "content-length": String(GitHubLimits.maxBodyBytes + 1) },
    };
    expect((await failure([oversized])).code).toBe("too-large");
  });

  test("a streamed body over the cap is too-large and the stream is cancelled", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    let sent = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
        if (sent > 64) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetch: GitHubFetch = () => Promise.resolve(new Response(stream, { status: 200 }));
    const error: unknown = await load(fetch).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(GitHubDataError);
    expect((error as GitHubDataError).code).toBe("too-large");
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(16);
  });
});

describe("non-JSON and error bodies", () => {
  test("an HTML 500 is http", async () => {
    const error = await failure([exchange("html-500")]);
    expect(error.code).toBe("http");
    expect(error.status).toBe(500);
  });

  test("an HTML 200 is invalid-response", async () => {
    expect((await failure([exchange("html-200")])).code).toBe("invalid-response");
  });

  test("partial data with errors is graphql and returns nothing", async () => {
    const error = await failure([exchange("graphql-partial-errors")]);
    expect(error.code).toBe("graphql");
    expect(error.message).toContain("FORBIDDEN");
  });
});
