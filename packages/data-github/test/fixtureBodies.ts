import type { Exchange } from "./replayFetch.js";

// The shape of the recorded bodies, as far as tests change them. Values a test replaces with
// something malformed are `unknown`; the loader under test does the validation.

export interface FixtureBody {
  data: { user: unknown; [key: string]: unknown } | null;
  errors?: unknown;
}

export interface FixtureUser {
  login: unknown;
  bio: unknown;
  websiteUrl: unknown;
  avatarUrl: unknown;
  createdAt?: unknown;
  followers: { totalCount: unknown };
  contributionsCollection: { contributionCalendar: FixtureCalendar };
}

export interface FixtureCalendar {
  totalContributions: number;
  weeks: { contributionDays: FixtureDay[] }[];
}

export interface FixtureDay {
  date: unknown;
  contributionCount: number;
  contributionLevel: unknown;
  weekday: unknown;
}

export interface FixtureConnection {
  totalCount: unknown;
  pageInfo: { hasNextPage: unknown; endCursor: unknown };
  nodes: FixtureRepository[];
}

export interface FixtureRepository {
  url: unknown;
  homepageUrl: unknown;
  stargazerCount: unknown;
  forkCount: unknown;
  primaryLanguage: FixtureLanguage;
  languages: { edges: { size: unknown; node: FixtureLanguage }[] };
}

export interface FixtureLanguage {
  name: unknown;
  color: unknown;
}

/** A copy of `source` whose body `mutate` changed (it gets a deep copy). */
export function withBody(source: Exchange, mutate: (body: FixtureBody) => void): Exchange {
  const body = structuredClone(source.body) as FixtureBody;
  mutate(body);
  return { ...source, body };
}

/** A copy of a profile exchange with its `user` changed. */
export function withUser(source: Exchange, mutate: (user: FixtureUser) => void): Exchange {
  return withBody(source, (body) => {
    mutate(body.data?.user as FixtureUser);
  });
}

export function withCalendar(
  source: Exchange,
  mutate: (calendar: FixtureCalendar) => void,
): Exchange {
  return withUser(source, (user) => {
    mutate(user.contributionsCollection.contributionCalendar);
  });
}

/** A copy of a repositories exchange with its connection changed. */
export function withRepositories(
  source: Exchange,
  mutate: (connection: FixtureConnection) => void,
): Exchange {
  return withBody(source, (body) => {
    mutate((body.data?.user as { repositories: FixtureConnection }).repositories);
  });
}

/** `items[index]`, failing the test instead of yielding `undefined`. */
export function item<T>(items: readonly T[], index: number): T {
  const value = items.at(index);
  if (value === undefined) throw new Error(`no item at ${String(index)}`);
  return value;
}
