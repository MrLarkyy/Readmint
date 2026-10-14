# GitHub data source

`@readmint/data-github` loads one GitHub user's profile, public repositories, languages and contribution calendar
through the GraphQL API with the user's own token, and returns a plain-JSON data object that designs bind to as
`github.*`. It runs in Node 22 and in the browser (native `fetch` and `crypto.subtle`, no dependencies).

```ts
import { loadGitHubData, MemoryCache, GITHUB_DATA_NAMESPACE } from "@readmint/data-github";
import { FileCache } from "@readmint/data-github/node";

const { data, meta } = await loadGitHubData({
  token,
  cache: new FileCache({ directory: ".readmint-cache" }),
});
const bindings = { [GITHUB_DATA_NAMESPACE]: data }; // a design reads {{github.followers}}
```

The main entry imports no `node:` module; `FileCache` lives in the `./node` subpath.

## API

- `loadGitHubData(options): Promise<GitHubLoadResult>` — resolves to `{ data, meta }`. `data` is the data object below.
  `meta` describes the load and is kept out of `data`, so the same GitHub state gives the same object:
  `requests` (HTTP requests including retries), `cost` (GraphQL rate-limit points), `rateLimitRemaining` and
  `resetAt` (from the last response, `null` when unknown) and `fromCache`.
- `GitHubDataError` — every failure; `code` is a `GitHubDataErrorCode` (see [Errors](#errors)), with `status`,
  `resetAt`, `retryAfterSeconds` or `causeCode` when they apply.
- `GitHubCache` — the cache interface: `get(key)` resolves to the stored text or `undefined`, `set(key, value,
ttlSeconds)` stores it.
- `MemoryCache({ now?, maxEntries? })` — an in-process cache (default 32 entries, oldest dropped first).
- `FileCache({ directory, now? })` from `@readmint/data-github/node` — see [Cache](#cache).
- `GitHubLimits` — the option ranges, defaults and fixed caps below, frozen.
- `GITHUB_DATA_VERSION` (`0`) and `GITHUB_DATA_NAMESPACE` (`"github"`).

### Options

| option                | default    | range         | meaning                                                                    |
| --------------------- | ---------- | ------------- | -------------------------------------------------------------------------- |
| `token`               | (required) | visible ASCII | the user's token; sent only in the `Authorization` header                  |
| `login`               | the viewer | GitHub login  | the user to load; without it the token's owner is resolved first           |
| `pageSize`            | 100        | 1–100         | repositories per request                                                   |
| `maxRepositories`     | 300        | 1–1000        | repositories loaded at most                                                |
| `requestTimeoutMs`    | 30000      | 1000–120000   | per request, body included                                                 |
| `maxRetryWaitSeconds` | 60         | 0–900         | the longest secondary rate-limit wait accepted                             |
| `cacheTtlSeconds`     | 3600       | 1–604800      | lifetime of a cache entry                                                  |
| `cache`               | none       |               | a `GitHubCache`                                                            |
| `fetch`               | `fetch`    |               | `(url, init) => Promise<Response>`, injectable for tests                   |
| `sleep`               | timer      |               | `(milliseconds) => Promise<void>`, used for rate-limit and 5xx retry waits |
| `signal`              | none       |               | an `AbortSignal` that cancels the load (reported as `timeout`)             |

A value outside its range fails with `invalid-option` before any request.

Fixed caps (`GitHubLimits`): a response body of at most 8 MiB, strings of at most 1024 characters, at most 54 calendar
weeks, the first 100 languages of each repository (by size; the rest are not counted), and 3 attempts per request
under a secondary rate limit.

## Data object

Current version: **0**

Every value is JSON: absent values are `null`, never missing; dates are `YYYY-MM-DD`; timestamps are ISO 8601 in UTC
as GitHub returns them. Array items are written `[]` below.

| path                                   | type              | meaning                                                                |
| -------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `version`                              | number            | data object version, `0`                                               |
| `login`                                | string            | GitHub login                                                           |
| `name`                                 | string \| null    | display name                                                           |
| `bio`                                  | string \| null    | profile bio                                                            |
| `company`                              | string \| null    | company                                                                |
| `location`                             | string \| null    | location                                                               |
| `websiteUrl`                           | string \| null    | website; `null` unless it is an absolute `https://` URL                |
| `twitterUsername`                      | string \| null    | X/Twitter user name                                                    |
| `avatarUrl`                            | string            | avatar image URL (`https://`; an external reference, not inlined here) |
| `url`                                  | string            | profile URL                                                            |
| `createdAt`                            | timestamp         | account creation                                                       |
| `followers`                            | number            | followers                                                              |
| `following`                            | number            | users followed                                                         |
| `counts`                               | object            | totals                                                                 |
| `counts.repositories`                  | number            | public repositories the user owns, including those beyond the cap      |
| `counts.stars`                         | number            | stars of the loaded repositories that are not forks                    |
| `counts.forks`                         | number            | forks of the loaded repositories that are not forks                    |
| `repositories`                         | array             | loaded public repositories the user owns, forks included               |
| `repositories[].name`                  | string            | repository name                                                        |
| `repositories[].nameWithOwner`         | string            | `owner/name`                                                           |
| `repositories[].description`           | string \| null    | description                                                            |
| `repositories[].url`                   | string            | repository URL                                                         |
| `repositories[].homepageUrl`           | string \| null    | homepage; `null` unless it is an absolute `https://` URL               |
| `repositories[].stars`                 | number            | stargazers                                                             |
| `repositories[].forks`                 | number            | forks of this repository                                               |
| `repositories[].isFork`                | boolean           | the repository is a fork                                               |
| `repositories[].isArchived`            | boolean           | the repository is archived                                             |
| `repositories[].createdAt`             | timestamp         | creation                                                               |
| `repositories[].pushedAt`              | timestamp \| null | last push; `null` for an empty repository                              |
| `repositories[].primaryLanguage`       | object \| null    | the main language                                                      |
| `repositories[].primaryLanguage.name`  | string            | language name                                                          |
| `repositories[].primaryLanguage.color` | string \| null    | `#rrggbb`, or `null` when GitHub has none (or sent anything else)      |
| `repositories[].languages`             | array             | languages of the repository                                            |
| `repositories[].languages[].name`      | string            | language name                                                          |
| `repositories[].languages[].color`     | string \| null    | `#rrggbb` or `null`                                                    |
| `repositories[].languages[].bytes`     | number            | bytes of code                                                          |
| `repositoriesTruncated`                | boolean           | the user owns more public repositories than were loaded                |
| `languages`                            | array             | languages over the loaded repositories that are not forks              |
| `languages[].name`                     | string            | language name                                                          |
| `languages[].color`                    | string \| null    | `#rrggbb` or `null`                                                    |
| `languages[].bytes`                    | number            | bytes of code                                                          |
| `languages[].share`                    | number            | `bytes` over the bytes of all languages, 0–1 (0 when there are none)   |
| `contributions`                        | object            | the contribution calendar GitHub shows on the profile                  |
| `contributions.total`                  | number            | contributions in the calendar                                          |
| `contributions.commits`                | number            | commit contributions                                                   |
| `contributions.pullRequests`           | number            | pull requests opened                                                   |
| `contributions.issues`                 | number            | issues opened                                                          |
| `contributions.reviews`                | number            | pull request reviews                                                   |
| `contributions.private`                | number            | contributions to private repositories (a count only)                   |
| `contributions.from`                   | date              | first calendar day                                                     |
| `contributions.to`                     | date              | last calendar day                                                      |
| `contributions.weeks`                  | number            | calendar columns (weeks)                                               |
| `contributions.days`                   | array             | every calendar day, ascending                                          |
| `contributions.days[].date`            | date              | the day                                                                |
| `contributions.days[].count`           | number            | contributions that day                                                 |
| `contributions.days[].level`           | number            | 0 (none) to 4 (fourth quartile), GitHub's colour level                 |
| `contributions.days[].weekday`         | number            | 0 = Sunday to 6 = Saturday                                             |
| `contributions.days[].week`            | number            | calendar column, from 0                                                |
| `contributions.streaks`                | object            | runs of consecutive days with contributions                            |
| `contributions.streaks.current`        | object            | the current streak                                                     |
| `contributions.streaks.current.length` | number            | days; 0 when there is none                                             |
| `contributions.streaks.current.start`  | date \| null      | first day, `null` when the length is 0                                 |
| `contributions.streaks.current.end`    | date \| null      | last day, `null` when the length is 0                                  |
| `contributions.streaks.longest`        | object            | the longest streak in the calendar                                     |
| `contributions.streaks.longest.length` | number            | days; 0 when there is none                                             |
| `contributions.streaks.longest.start`  | date \| null      | first day, `null` when the length is 0                                 |
| `contributions.streaks.longest.end`    | date \| null      | last day, `null` when the length is 0                                  |

A test keeps this table equal to the fields the loader produces.

### Ordering

The order never depends on the response order, the locale or the clock, so the same GitHub state gives a
byte-identical object:

- `repositories`: by `stars` descending, then `nameWithOwner`.
- `repositories[].languages` and `languages`: by `bytes` descending, then `name`.
- Names compare by UTF-16 code units, not by locale.
- A repository GitHub returns on two pages (its stars changed while loading) appears once.

### Calendar, dates and streaks

- The calendar is the one GitHub shows on the profile: about one year up to today, in weeks from Sunday to Saturday;
  the first and the last week may be partial. Dates are GitHub's calendar dates; the loader never converts them with
  the local timezone.
- A streak is a run of consecutive days with a count above 0. `longest` is the earliest of the longest runs.
  `current` is the run ending on the last calendar day, or on the day before when the last day has no contributions
  yet (that day may not be over).
- No field holds the time of the load.

### Repositories and privacy

Only **public** repositories the user owns are loaded (`privacy: PUBLIC`, `ownerAffiliations: OWNER`), because a README
is public: private repository names and languages never enter the object. Private work shows only as
`contributions.private` and in the calendar counts, and only when the user allows it on their profile.
Whether a token of the user also shows private contributions for `user(login)` the same way the profile page does is
checked by the live run.

Repositories are loaded in pages of `pageSize`, in GitHub's order (stars descending), until there is no next page or
`maxRepositories` is reached; `repositoriesTruncated` is then `true`. A next page without a cursor, or a cursor GitHub
returns twice, fails with `invalid-response` instead of looping. Requests run one after another: the viewer (without
`login`), the profile with the calendar, then the repository pages.

## Errors

Every failure is a `GitHubDataError`. A GraphQL `errors` entry fails the whole load: no partial data object is ever
returned. Messages never contain the token or the response values, only the JSON path that failed.

| code                     | when                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `missing-token`          | no token, or only whitespace                                                            |
| `invalid-option`         | an option out of range, an invalid `login`, or a token with whitespace or control bytes |
| `unauthorized`           | HTTP 401: the token is wrong or expired                                                 |
| `forbidden`              | HTTP 403 that is not a rate limit (for example a missing scope)                         |
| `not-found`              | no user with that login                                                                 |
| `rate-limited`           | the primary rate limit is exhausted; `resetAt` says when it resets                      |
| `secondary-rate-limited` | a secondary rate limit outlasted the allowed wait or attempts; `retryAfterSeconds`      |
| `http`                   | any other non-2xx status (a 502, 503 or 504 after one retry)                            |
| `network`                | the API could not be reached; `causeCode` such as `ECONNRESET` when known               |
| `timeout`                | `requestTimeoutMs` passed, or `signal` aborted                                          |
| `invalid-response`       | a body that is not JSON or does not match the expected shape, types or ranges           |
| `graphql`                | GitHub answered with GraphQL errors (up to 3 types and messages, redacted, shortened)   |
| `too-large`              | a response body over 8 MiB                                                              |

Every value is validated before use: types, non-negative integer counts, dates and timestamps, a calendar without gaps
whose weekdays match the dates and whose day counts add up to the total, `https://` URLs, and `#rrggbb` colours.
Values that GitHub passes through from users (`websiteUrl`, `homepageUrl`, colours) become `null` instead of failing.
Strings are otherwise kept as GitHub returns them; the renderer escapes them.

## Rate limits

- **Primary** (200 with a `RATE_LIMITED` error, or 403/429 with `x-ratelimit-remaining: 0`): fails at once with
  `rate-limited` and `resetAt`; the loader never waits for a reset.
- **Secondary** (429, or 403 with `retry-after` or a "secondary rate limit" message): waits `retry-after` seconds (60
  when absent) and retries, at most 3 attempts in all. A wait above `maxRetryWaitSeconds` fails at once with
  `secondary-rate-limited` and `retryAfterSeconds`.
- 502, 503 and 504 are retried once after one second.
- A full load costs about 2 + `maxRepositories / pageSize` requests (at most 12 with the defaults).

## Cache

With a `cache`, the validated GitHub responses of a load are stored as one entry and a later load within
`cacheTtlSeconds` sends no profile or repository request (in viewer mode only the viewer request). A hit is
validated again and rebuilt by the current code, so a changed loader needs no invalidation, and an entry that fails
validation, or belongs to another login, is a miss and is replaced.

The key is the SHA-256 hex digest of the data version, a hash of the query text, the login (lowercased) and
`pageSize` and `maxRepositories`. It never covers the token, so two tokens of the same user share an entry; the
login is resolved before the lookup, so one cache serves several users.

`FileCache` writes one `<key>.json` file per entry, `{ storedAt, ttlSeconds, value }`: the directory with mode
`0o700` when it creates it, files with mode `0o600`, through a temporary file and a rename. A file over 16 MiB, a
corrupt file or an expired entry is a miss.

## Token

The token is only ever sent in the `Authorization` header of requests to `https://api.github.com/graphql` (redirects
are refused). It is never put in a URL, a request body, an error message, the data object, `meta`, a cache key or a
cache entry, and errors carry no `cause`. A GitHub message that echoes a token, or anything shaped like a GitHub token
(`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), is redacted to `***`. A token with whitespace or control
characters is refused before any request (it could inject a header). Tests check all of this with a canary token on
every error path.

## Versioning

`version` is `GITHUB_DATA_VERSION`. Adding a field keeps the version; renaming or removing a field, or changing its
meaning or type, bumps it. Designs bind to the object as `{ github: data }`; the design format version does not change
with it.

## Tests and the live run

The tests replay recorded GitHub responses of a synthetic user (`packages/data-github/test/fixtures`) with no
network. One live run against GitHub uses the user's token from an environment variable, never printed:

```bash
READMINT_GITHUB_TOKEN="$(gh auth token)" pnpm vitest run --project node packages/data-github/test/live.test.ts
```

Without `READMINT_GITHUB_TOKEN` the live test is skipped and sends no request.
