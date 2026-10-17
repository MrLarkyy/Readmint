import { GitHubLimits } from "./GitHubSourceOptions.js";
import type { GraphQLOperation } from "./postGraphQL.js";

// Values reach GitHub only as variables, never spliced into the query text.

const RATE_LIMIT = "rateLimit { cost remaining resetAt }";

const REPOSITORY_FIELDS = `name nameWithOwner description url homepageUrl stargazerCount forkCount
        isFork isArchived createdAt pushedAt
        primaryLanguage { name color }
        languages(first: 100, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }`;

export const viewerQuery: GraphQLOperation = {
  operationName: "ReadmintViewer",
  query: `query ReadmintViewer {
  viewer { login }
  ${RATE_LIMIT}
}`,
};

export const profileQuery: GraphQLOperation = {
  operationName: "ReadmintProfile",
  query: `query ReadmintProfile($login: String!) {
  user(login: $login) {
    id login name bio company location websiteUrl twitterUsername avatarUrl url createdAt
    followers { totalCount }
    following { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel weekday } }
      }
    }
  }
  ${RATE_LIMIT}
}`,
};

export const repositoriesQuery: GraphQLOperation = {
  operationName: "ReadmintRepositories",
  query: `query ReadmintRepositories($login: String!, $first: Int!, $after: String) {
  user(login: $login) {
    repositories(
      first: $first
      after: $after
      ownerAffiliations: OWNER
      privacy: PUBLIC
      orderBy: { field: STARGAZERS, direction: DESC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        ${REPOSITORY_FIELDS}
      }
    }
  }
  ${RATE_LIMIT}
}`,
};

// `from`/`to` are DateTime and `since`/`until` GitTimestamp: GraphQL does not let one variable
// serve both argument types, so the same instants are sent twice.
export const activityQuery: GraphQLOperation = {
  operationName: "ReadmintActivity",
  query: `query ReadmintActivity($login: String!, $author: ID!, $from: DateTime!, $to: DateTime!, $since: GitTimestamp!, $until: GitTimestamp!) {
  user(login: $login) {
    status { message emoji organization { id } }
    pinnedItems(first: ${String(GitHubLimits.maxPinned)}, types: [REPOSITORY]) {
      nodes {
        ... on Repository {
          id isPrivate
          ${REPOSITORY_FIELDS}
        }
      }
    }
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: ${String(GitHubLimits.maxPushRepositories)}) {
        repository {
          name nameWithOwner isPrivate
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: ${String(GitHubLimits.maxCommitsPerRepository)}, since: $since, until: $until, author: { id: $author }) {
                  nodes { oid messageHeadline committedDate additions deletions }
                }
              }
            }
          }
        }
      }
    }
  }
  ${RATE_LIMIT}
}`,
};

/** Names of the week boundary variables `t0` to `t52` of `weeksQuery`. */
export const weekBoundaryNames: readonly string[] = Array.from(
  { length: GitHubLimits.weeklyCommitWeeks + 1 },
  (_, index) => `t${String(index)}`,
);

/** Names of the week aliases `w0` to `w51` of `weeksQuery`. */
export const weekAliases: readonly string[] = Array.from(
  { length: GitHubLimits.weeklyCommitWeeks },
  (_, index) => `w${String(index)}`,
);

function weeksQueryText(): string {
  const declarations = weekBoundaryNames.map((name) => `$${name}: GitTimestamp!`).join(", ");
  const aliases = weekAliases
    .map(
      (alias, index) =>
        `${alias}: history(first: 1, since: $${weekBoundaryNames[index] ?? ""}, until: $${weekBoundaryNames[index + 1] ?? ""}, author: { id: $author }) { totalCount }`,
    )
    .join("\n            ");
  return `query ReadmintWeeks($ids: [ID!]!, $author: ID!, ${declarations}) {
  nodes(ids: $ids) {
    ... on Repository {
      id
      defaultBranchRef {
        target {
          ... on Commit {
            ${aliases}
          }
        }
      }
    }
  }
  ${RATE_LIMIT}
}`;
}

export const weeksQuery: GraphQLOperation = {
  operationName: "ReadmintWeeks",
  query: weeksQueryText(),
};

export const contributedQuery: GraphQLOperation = {
  operationName: "ReadmintContributed",
  query: `query ReadmintContributed($login: String!) {
  user(login: $login) {
    repositoriesContributedTo(
      first: ${String(GitHubLimits.maxContributedRepositories)}
      contributionTypes: [COMMIT]
      includeUserRepositories: true
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      nodes { id nameWithOwner isFork isPrivate }
    }
  }
  ${RATE_LIMIT}
}`,
};

export const authoredHistoryQuery: GraphQLOperation = {
  operationName: "ReadmintAuthoredHistory",
  query: `query ReadmintAuthoredHistory($ids: [ID!]!, $author: ID!) {
  nodes(ids: $ids) {
    ... on Repository {
      id nameWithOwner
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: ${String(GitHubLimits.languageCommitsPerRepository)}, author: { id: $author }) {
              nodes { oid committedDate parents { totalCount } }
            }
          }
        }
      }
    }
  }
  ${RATE_LIMIT}
}`,
};

/** Every query text, in a fixed order; part of the cache key so a query change misses. */
export const allQueries: readonly GraphQLOperation[] = [
  viewerQuery,
  profileQuery,
  repositoriesQuery,
  activityQuery,
  weeksQuery,
  contributedQuery,
  authoredHistoryQuery,
];
