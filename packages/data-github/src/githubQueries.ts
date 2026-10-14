import type { GraphQLOperation } from "./postGraphQL.js";

// Values reach GitHub only as variables, never spliced into the query text.

const RATE_LIMIT = "rateLimit { cost remaining resetAt }";

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
    login name bio company location websiteUrl twitterUsername avatarUrl url createdAt
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
        name nameWithOwner description url homepageUrl stargazerCount forkCount
        isFork isArchived createdAt pushedAt
        primaryLanguage { name color }
        languages(first: 100, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
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
];
