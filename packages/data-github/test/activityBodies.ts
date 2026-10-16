import { withBody } from "./fixtureBodies.js";
import { exchange, pageExchanges, type Exchange } from "./replayFetch.js";

// The shape of the recorded activity and weeks bodies, as far as tests change them.

export interface FixtureCommit {
  oid: string;
  messageHeadline: unknown;
  committedDate: string;
  additions: number;
  deletions: number;
}

export interface FixtureContribution {
  repository: {
    name: string;
    nameWithOwner: string;
    isPrivate: boolean;
    defaultBranchRef: { target: { history: { nodes: FixtureCommit[] } } } | null;
  };
}

export interface FixtureActivityUser {
  status: unknown;
  pinnedItems: { nodes: unknown[] };
  contributionsCollection: { commitContributionsByRepository: FixtureContribution[] };
}

/** A copy of the activity exchange (or `source`) with its `user` changed. */
export function withActivity(
  mutate: (user: FixtureActivityUser) => void,
  source: Exchange = exchange("activity"),
): Exchange {
  return withBody(source, (body) => {
    mutate(body.data?.user as FixtureActivityUser);
  });
}

/** `source` answering another operation, as when GitHub fails a request the test did not plan for. */
export function answering(source: Exchange, operation: string, variables: object): Exchange {
  return {
    ...source,
    request: { operation, variables: { ...variables } },
  };
}

/** The recorded weeks request for other node ids, answered with `nodes`. */
export function weeksFor(ids: readonly string[], nodes: readonly unknown[]): Exchange {
  const recorded = exchange("weeks");
  const variables = { ...recorded.request.variables, ids: [...ids] };
  return withBody({ ...recorded, request: { ...recorded.request, variables } }, (body) => {
    if (body.data) body.data.nodes = [...nodes];
  });
}

/** A weeks node whose 52 weeks all have `count` commits. */
export function weeksNode(id: string, count: number): unknown {
  const target: Record<string, { totalCount: number }> = {};
  for (let week = 0; week < 52; week += 1) target[`w${String(week)}`] = { totalCount: count };
  return { id, defaultBranchRef: { target } };
}

/** The node ids of the repositories a load falls back to when nothing is pinned. */
export const FALLBACK_IDS = ["R_readmint", "R_dotfiles", "R_notes", "R_site"];

/** The pages, an activity without pins and weeks for the fallback repositories. */
export function fallbackExchanges(activity: Exchange = exchange("activity-no-pinned")): Exchange[] {
  return [
    ...pageExchanges(),
    activity,
    weeksFor(
      FALLBACK_IDS,
      FALLBACK_IDS.map((id) => weeksNode(id, 1)),
    ),
  ];
}

export function commit(oid: string, date: string, message: unknown = "message"): FixtureCommit {
  return { oid, messageHeadline: message, committedDate: date, additions: 1, deletions: 0 };
}

export function contribution(name: string, commits: FixtureCommit[]): FixtureContribution {
  return {
    repository: {
      name,
      nameWithOwner: `readmint-fixture/${name}`,
      isPrivate: false,
      defaultBranchRef: { target: { history: { nodes: commits } } },
    },
  };
}
