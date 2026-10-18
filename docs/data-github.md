# GitHub data

`@readmint/data-github` loads one GitHub user's profile, public repositories, languages, contribution calendar, pinned
repositories with their weekly commits, recent pushes and status through the GraphQL API with the user's own token (with a `languageCommitCap` it also reads the user's own commits over the REST API and, with the user's own token, counts private repositories into `languagesAuthored`: language names and sums only), and returns a plain-JSON data object that designs bind to as
`github.*`. It is a [data source](data-sources.md) (`githubDataSource`, namespace `github`). It runs in Node 22 and in the browser (native `fetch` and `crypto.subtle`; its only dependency is `@readmint/data`).

```ts
import { loadGitHubData, MemoryCache, GITHUB_DATA_NAMESPACE } from "@readmint/data-github";
import { FileCache } from "@readmint/data-github/node"; // or "@readmint/data/node"

const { data, meta } = await loadGitHubData({
  token,
  cache: new FileCache({ directory: ".readmint-cache" }),
});
const bindings = { [GITHUB_DATA_NAMESPACE]: data }; // a design reads {{github.followers}}
```

The main entry imports no `node:` module; `FileCache` lives in the `./node` subpath.

## API

- `githubDataSource` — the source descriptor of the shared `@readmint/data` interface (`{ interfaceVersion, namespace:
"github", dataVersion: 0, load }`), frozen; `load` is `loadGitHubData`.
- `loadGitHubData(options): Promise<GitHubLoadResult>` — resolves to `{ data, meta }`. `data` is the data object below.
  `meta` describes the load and is kept out of `data`, so the same GitHub state gives the same object:
  `requests` (HTTP requests including retries, GraphQL and REST), `cost` (GraphQL rate-limit points), `rateLimitRemaining` and
  `resetAt` (from the last response, `null` when unknown), `fromCache` and `partial` (the parts GitHub refused or the load only partly counted,
  see [Pinned repositories, pushes and status](#pinned-repositories-pushes-and-status) and
  [Languages from your own commits](#languages-from-your-own-commits)).
- `GitHubDataError` — every failure; it extends `DataSourceError` with `source` `"github"`; `code` is a `GitHubDataErrorCode` (see [Errors](#errors)), with `status`,
  `resetAt`, `retryAfterSeconds` or `causeCode` when they apply.
- `GitHubCache` — the `DataSourceCache` interface: `get(key)` resolves to the stored text or `undefined`, `set(key, value,
ttlSeconds)` stores it.
- `MemoryCache({ now?, maxEntries? })` — an in-process cache (default 32 entries, oldest dropped first); defined in `@readmint/data`, re-exported here.
- `FileCache({ directory, now? })` from `@readmint/data-github/node` — see [Cache](#cache).
- `GitHubLimits` — the option ranges, defaults and fixed caps below, frozen.
- `GITHUB_DATA_VERSION` (`0`) and `GITHUB_DATA_NAMESPACE` (`"github"`).

### Options

| option                | default    | range           | meaning                                                                                                                                  |
| --------------------- | ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `token`               | (required) | visible ASCII   | the user's token; sent only in the `Authorization` header                                                                                |
| `login`               | the viewer | GitHub login    | the user to load; without it the token's owner is loaded. Required with an app or Actions token (`GITHUB_TOKEN`)                         |
| `excludeRepositories` | none       | up to 100 names | repositories left out of every aggregate, as `name` or `owner/name`, case-insensitive; see [Languages](#languages)                       |
| `languageCommitCap`   | 0 (off)    | 0–2000          | own commits read for `languagesAuthored`, one REST request each; see [Languages from your own commits](#languages-from-your-own-commits) |
| `pageSize`            | 100        | 1–100           | repositories per request                                                                                                                 |
| `maxRepositories`     | 300        | 1–1000          | repositories loaded at most                                                                                                              |
| `requestTimeoutMs`    | 30000      | 1000–120000     | per request, body included                                                                                                               |
| `maxRetryWaitSeconds` | 60         | 0–900           | the longest secondary rate-limit wait accepted                                                                                           |
| `cacheTtlSeconds`     | 3600       | 1–604800        | lifetime of a cache entry                                                                                                                |
| `cache`               | none       |                 | a `GitHubCache`                                                                                                                          |
| `fetch`               | `fetch`    |                 | `(url, init) => Promise<Response>`, injectable for tests                                                                                 |
| `sleep`               | timer      |                 | `(milliseconds) => Promise<void>` for retry waits; the default ends on abort                                                             |
| `languageSignal`      | none       |                 | an `AbortSignal` that ends only the reading of own commits: the load keeps all other data and reports `authored` in `meta.partial`       |
| `signal`              | none       |                 | an `AbortSignal` that cancels the load, retry waits included (as `timeout`)                                                              |

A value outside its range fails with `invalid-option` before any request.

Fixed caps (`GitHubLimits`): a response body of at most 8 MiB, strings of at most 1024 characters, at most 54 calendar
weeks, the first 100 languages of each repository (by size; the rest are not counted), 3 attempts per request
under a secondary rate limit, 6 pinned repositories, 10 pushes (from at most 10 repositories with at most 10 commits
each, over 7 days), 52 weeks of weekly commits, and a commit message cut at 1024 UTF-16 units on a code point
boundary instead of failing the load. Own-commit reading adds: at most 2000 commits (`maxLanguageCommitCap`), 100
commits per repository, 10 repositories per history request, 300 files per commit, 100 REST requests left as the floor.

## Data object

Current version: **0**

Every value is JSON: absent values are `null`, never missing; dates are `YYYY-MM-DD`; timestamps are ISO 8601 in UTC
as GitHub returns them. Array items are written `[]` below.

| path                                   | type              | meaning                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                              | number            | data object version, `0`                                                                                                                                                                                                   |
| `login`                                | string            | GitHub login                                                                                                                                                                                                               |
| `name`                                 | string \| null    | display name                                                                                                                                                                                                               |
| `bio`                                  | string \| null    | profile bio                                                                                                                                                                                                                |
| `company`                              | string \| null    | company                                                                                                                                                                                                                    |
| `location`                             | string \| null    | location                                                                                                                                                                                                                   |
| `websiteUrl`                           | string \| null    | website; `null` unless it is an absolute `https://` URL                                                                                                                                                                    |
| `twitterUsername`                      | string \| null    | X/Twitter user name                                                                                                                                                                                                        |
| `avatarUrl`                            | string            | avatar image URL (`https://`); draw it with an image asset `src: "{{ github.avatarUrl }}"`, fetched and inlined by the CLI (`--fetch-images`) and the Action ([asset-loading.md](asset-loading.md#images-bound-from-data)) |
| `url`                                  | string            | profile URL                                                                                                                                                                                                                |
| `createdAt`                            | timestamp         | account creation                                                                                                                                                                                                           |
| `followers`                            | number            | followers                                                                                                                                                                                                                  |
| `following`                            | number            | users followed                                                                                                                                                                                                             |
| `counts`                               | object            | totals                                                                                                                                                                                                                     |
| `counts.repositories`                  | number            | public repositories the user owns, including those beyond the cap                                                                                                                                                          |
| `counts.stars`                         | number            | stars of the loaded repositories that are not forks                                                                                                                                                                        |
| `counts.forks`                         | number            | forks of the loaded repositories that are not forks                                                                                                                                                                        |
| `repositories`                         | array             | loaded public repositories the user owns, forks included                                                                                                                                                                   |
| `repositories[].name`                  | string            | repository name                                                                                                                                                                                                            |
| `repositories[].nameWithOwner`         | string            | `owner/name`                                                                                                                                                                                                               |
| `repositories[].description`           | string \| null    | description                                                                                                                                                                                                                |
| `repositories[].url`                   | string            | repository URL                                                                                                                                                                                                             |
| `repositories[].homepageUrl`           | string \| null    | homepage; `null` unless it is an absolute `https://` URL                                                                                                                                                                   |
| `repositories[].stars`                 | number            | stargazers                                                                                                                                                                                                                 |
| `repositories[].forks`                 | number            | forks of this repository                                                                                                                                                                                                   |
| `repositories[].isFork`                | boolean           | the repository is a fork                                                                                                                                                                                                   |
| `repositories[].isArchived`            | boolean           | the repository is archived                                                                                                                                                                                                 |
| `repositories[].createdAt`             | timestamp         | creation                                                                                                                                                                                                                   |
| `repositories[].pushedAt`              | timestamp \| null | last push; `null` for an empty repository                                                                                                                                                                                  |
| `repositories[].primaryLanguage`       | object \| null    | the main language                                                                                                                                                                                                          |
| `repositories[].primaryLanguage.name`  | string            | language name                                                                                                                                                                                                              |
| `repositories[].primaryLanguage.color` | string \| null    | `#rrggbb`, or `null` when GitHub has none (or sent anything else)                                                                                                                                                          |
| `repositories[].languages`             | array             | languages of the repository                                                                                                                                                                                                |
| `repositories[].languages[].name`      | string            | language name                                                                                                                                                                                                              |
| `repositories[].languages[].color`     | string \| null    | `#rrggbb` or `null`                                                                                                                                                                                                        |
| `repositories[].languages[].bytes`     | number            | bytes of code                                                                                                                                                                                                              |
| `pinned`                               | array             | the profile's pinned repositories, else the most starred own ones; see [Pinned repositories, pushes and status](#pinned-repositories-pushes-and-status)                                                                    |
| `pinned[].name`                        | string            | repository name                                                                                                                                                                                                            |
| `pinned[].nameWithOwner`               | string            | `owner/name`                                                                                                                                                                                                               |
| `pinned[].description`                 | string \| null    | description                                                                                                                                                                                                                |
| `pinned[].url`                         | string            | repository URL                                                                                                                                                                                                             |
| `pinned[].homepageUrl`                 | string \| null    | homepage; `null` unless it is an absolute `https://` URL                                                                                                                                                                   |
| `pinned[].stars`                       | number            | stargazers                                                                                                                                                                                                                 |
| `pinned[].forks`                       | number            | forks of this repository                                                                                                                                                                                                   |
| `pinned[].isFork`                      | boolean           | the repository is a fork                                                                                                                                                                                                   |
| `pinned[].isArchived`                  | boolean           | the repository is archived                                                                                                                                                                                                 |
| `pinned[].createdAt`                   | timestamp         | creation                                                                                                                                                                                                                   |
| `pinned[].pushedAt`                    | timestamp \| null | last push; `null` for an empty repository                                                                                                                                                                                  |
| `pinned[].primaryLanguage`             | object \| null    | the main language                                                                                                                                                                                                          |
| `pinned[].primaryLanguage.name`        | string            | language name                                                                                                                                                                                                              |
| `pinned[].primaryLanguage.color`       | string \| null    | `#rrggbb`, or `null` when GitHub has none (or sent anything else)                                                                                                                                                          |
| `pinned[].languages`                   | array             | languages of the repository                                                                                                                                                                                                |
| `pinned[].languages[].name`            | string            | language name                                                                                                                                                                                                              |
| `pinned[].languages[].color`           | string \| null    | `#rrggbb` or `null`                                                                                                                                                                                                        |
| `pinned[].languages[].bytes`           | number            | bytes of code                                                                                                                                                                                                              |
| `pinned[].weeklyCommits`               | array \| null     | your commits to the default branch in each of the last 52 weeks, oldest first; `null` when GitHub could not be asked                                                                                                       |
| `pushes`                               | array             | your commits of the last 7 days, newest first, at most 10; empty when unavailable                                                                                                                                          |
| `pushes[].repository`                  | string            | repository name without the owner                                                                                                                                                                                          |
| `pushes[].hash`                        | string            | the first 7 characters of the commit id                                                                                                                                                                                    |
| `pushes[].message`                     | string            | first line of the commit message, at most 1024 characters                                                                                                                                                                  |
| `pushes[].additions`                   | number            | lines added                                                                                                                                                                                                                |
| `pushes[].deletions`                   | number            | lines deleted                                                                                                                                                                                                              |
| `pushes[].date`                        | timestamp         | when the commit was made                                                                                                                                                                                                   |
| `status`                               | object \| null    | the profile status; `null` when none is set or GitHub did not return it                                                                                                                                                    |
| `status.message`                       | string \| null    | status text                                                                                                                                                                                                                |
| `status.emoji`                         | string \| null    | status emoji as a GitHub shortcode such as `:rocket:`                                                                                                                                                                      |
| `repositoriesTruncated`                | boolean           | the user owns more public repositories than were loaded                                                                                                                                                                    |
| `languages`                            | array             | languages over the loaded repositories that are not forks                                                                                                                                                                  |
| `languages[].name`                     | string            | language name                                                                                                                                                                                                              |
| `languages[].color`                    | string \| null    | `#rrggbb` or `null`                                                                                                                                                                                                        |
| `languages[].bytes`                    | number            | bytes of code                                                                                                                                                                                                              |
| `languagesByRepo`                      | array             | the same languages weighted by repository, see [Languages](#languages)                                                                                                                                                     |
| `languagesByRepo[].name`               | string            | language name                                                                                                                                                                                                              |
| `languagesByRepo[].color`              | string \| null    | `#rrggbb` or `null`                                                                                                                                                                                                        |
| `languagesByRepo[].share`              | number            | mean of the language's share inside each counted repository, 0-1; the shares sum to 1 (all 0 when no repository has language bytes)                                                                                        |
| `languagesByRepo[].repositories`       | number            | repositories that list the language                                                                                                                                                                                        |
| `languageRepositories`                 | array             | how many repositories use each language                                                                                                                                                                                    |
| `languageRepositories[].name`          | string            | language name                                                                                                                                                                                                              |
| `languageRepositories[].color`         | string \| null    | `#rrggbb` or `null`                                                                                                                                                                                                        |
| `languageRepositories[].repositories`  | number            | repositories that list the language                                                                                                                                                                                        |
| `languagesAuthored`                    | array             | the lines you added per language in your own commits, see [Languages from your own commits](#languages-from-your-own-commits); `[]` while `languageCommitCap` is 0                                                         |
| `languagesAuthored[].name`             | string            | language name                                                                                                                                                                                                              |
| `languagesAuthored[].color`            | string \| null    | `#rrggbb` or `null`                                                                                                                                                                                                        |
| `languagesAuthored[].share`            | number            | `additions` over the added lines of all languages, 0-1                                                                                                                                                                     |
| `languagesAuthored[].additions`        | number            | lines you added in files of the language                                                                                                                                                                                   |
| `languages[].share`                    | number            | `bytes` over the bytes of all languages, 0–1 (0 when there are none)                                                                                                                                                       |
| `contributions`                        | object            | the contribution calendar GitHub shows on the profile                                                                                                                                                                      |
| `contributions.total`                  | number            | contributions in the calendar                                                                                                                                                                                              |
| `contributions.commits`                | number            | commit contributions                                                                                                                                                                                                       |
| `contributions.pullRequests`           | number            | pull requests opened                                                                                                                                                                                                       |
| `contributions.issues`                 | number            | issues opened                                                                                                                                                                                                              |
| `contributions.reviews`                | number            | pull request reviews                                                                                                                                                                                                       |
| `contributions.private`                | number            | contributions the token's owner cannot see in detail (0 with the user's own token)                                                                                                                                         |
| `contributions.from`                   | date              | first calendar day                                                                                                                                                                                                         |
| `contributions.to`                     | date              | last calendar day                                                                                                                                                                                                          |
| `contributions.weeks`                  | number            | calendar columns (weeks)                                                                                                                                                                                                   |
| `contributions.days`                   | array             | every calendar day, ascending                                                                                                                                                                                              |
| `contributions.days[].date`            | date              | the day                                                                                                                                                                                                                    |
| `contributions.days[].count`           | number            | contributions that day                                                                                                                                                                                                     |
| `contributions.days[].level`           | number            | 0 (none) to 4 (fourth quartile), GitHub's colour level                                                                                                                                                                     |
| `contributions.days[].weekday`         | number            | 0 = Sunday to 6 = Saturday                                                                                                                                                                                                 |
| `contributions.days[].week`            | number            | calendar column, from 0                                                                                                                                                                                                    |
| `contributions.streaks`                | object            | runs of consecutive days with contributions                                                                                                                                                                                |
| `contributions.streaks.current`        | object            | the current streak                                                                                                                                                                                                         |
| `contributions.streaks.current.length` | number            | days; 0 when there is none                                                                                                                                                                                                 |
| `contributions.streaks.current.start`  | date \| null      | first day, `null` when the length is 0                                                                                                                                                                                     |
| `contributions.streaks.current.end`    | date \| null      | last day, `null` when the length is 0                                                                                                                                                                                      |
| `contributions.streaks.longest`        | object            | the longest streak in the calendar                                                                                                                                                                                         |
| `contributions.streaks.longest.length` | number            | days; 0 when there is none                                                                                                                                                                                                 |
| `contributions.streaks.longest.start`  | date \| null      | first day, `null` when the length is 0                                                                                                                                                                                     |
| `contributions.streaks.longest.end`    | date \| null      | last day, `null` when the length is 0                                                                                                                                                                                      |

A test keeps this table equal to the fields the loader produces.

### Ordering

The order never depends on the response order, the locale or the clock, so the same GitHub state gives a
byte-identical object:

- `repositories`: by `stars` descending, then `nameWithOwner`.
- `pinned`: in the order the user pinned them; without pins by `stars` descending, then `nameWithOwner`.
- `pushes`: newest `date` first, then `nameWithOwner`, then the full commit id.
- `repositories[].languages` and `languages`: by `bytes` descending, then `name`.
- `languagesByRepo`: by `share` descending, then `repositories` descending, then `name`; `languageRepositories`: by `repositories` descending, then `name`; `languagesAuthored`: by `additions` descending, then `name` (the shares are divided only after the integer sums are ordered).
- Names compare by UTF-16 code units, not by locale.
- A repository GitHub returns on two pages (its stars changed while loading) appears once.

### Languages

`languages` counts bytes, so one large repository can dominate it: a 3.3 MB TypeScript repository next to ten small
Kotlin ones gives TypeScript most of the share. `languagesByRepo` gives every loaded non-fork repository the same
weight 1, split over its languages by their bytes, and divides the sum by the number of repositories that have
language bytes; in that example Kotlin leads with 10 repositories of 11 and TypeScript has 1/11. A repository whose
languages all have 0 bytes is listed in `repositories` but adds no weight. `languageRepositories` is the plain count
of repositories per language. All three lists name the same languages. They are arrays, not objects keyed by
language, because a language name is free text. Forks are ignored, as in `languages`. The first 100 languages of each
repository are counted, as for `languages`.

`excludeRepositories` removes a repository (matched by `name` or `owner/name`, ignoring case) from
`repositories`, `counts.stars`, `counts.forks`, `languages`, `languagesByRepo`, `languageRepositories` and the
most-starred fallback of `pinned`. The repositories the user pinned on the profile stay in `pinned`, and
`counts.repositories` (the account's public total) is unchanged, and `pushes` and the contribution calendar still
include an excluded repository, as GitHub reports them per user. The cap of `maxRepositories` applies before the
exclusion, so `repositoriesTruncated` still describes the load. An entry that is not a repository name, a list of
more than 100 entries or a value that is not a list fails with `invalid-option`; the message names the position of
the entry, never its text. A non-empty list is part of the [cache](#cache) key, an empty one is not, so existing
entries stay valid.

### Languages from your own commits

`languagesAuthored` measures what you wrote, not what the repositories hold: repository bytes include other people's
code, vendored and generated files and code you no longer touch. With `languageCommitCap` above 0 the loader reads your
newest commits and sums the lines each of them added, per language.

- **Which commits.** The non-merge commits (one parent) authored by the loaded user on the **default branch** of the
  non-fork repositories GitHub lists as contributed to with commits (the first 100, most recently pushed first), at most
  100 per repository, newest first over all repositories (ties by commit id, then repository; a commit that two repositories share counts once, in the first by name); the first
  `languageCommitCap` of them are read. Forks and repositories in `excludeRepositories` add nothing. Work that is
  not on a default branch, and commits beyond the 100 newest of a repository, are not counted.
- **Which files.** Each commit is read from the REST API (`GET /repos/{owner}/{repo}/commits/{sha}`, one request per
  commit); GitHub lists at most 300 files of a commit, and only these are counted. A file counts for the language its
  name or extension has in the committed table (`authoredLanguageTable.ts`: Kotlin, Java, TypeScript, JavaScript,
  Python, Go, Rust, C, C++, C#, Swift, Ruby, PHP, Scala, Groovy, Gradle, Shell, PowerShell, HTML, CSS, SCSS, Vue,
  Svelte, Lua, Dart, Dockerfile, Makefile; names and colours follow GitHub Linguist, MIT). An unknown extension, and
  data or prose such as JSON, YAML or Markdown, is ignored, never guessed (`.h` is C or C++ and so is not counted).
  Generated and vendored files are excluded by a committed list: the directories `node_modules`, `dist`, `build`,
  `out`, `target`, `vendor`, `third_party`, `.gradle`, `__snapshots__`, `golden` and `generated` at any depth; lock
  files (`*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `gradle-wrapper*`); `*.min.*`, `*.map`, `*.snap`,
  `*.d.ts`; images, fonts and `.svg`. A change to the table or the list bumps `AUTHORED_TABLE_VERSION`, which is part of
  the cache keys.
- **Shares.** `additions` are integer sums; `share` is `additions` over the sum of all languages. A load without a
  counted line gives `[]`, and the profile templates then fall back to `languages`.
- **Privacy.** A private repository is read only when the token's owner is the loaded user; for any other login only
  public repositories are read. No repository name is in the result, only language names and sums.
- **Budget.** At most `languageCommitCap` REST requests plus 12 GraphQL requests (the viewer, the contributed
  repositories and at most 10 history requests of 10 repositories each), sequential, on top of the 7 to 14 of the rest
  of the load. Allow about 0.3 to 0.6 seconds per commit: 300 commits take about 2 to 3 minutes, 2000 about 10 to 20.
  The CLI allows 600 ms per commit on top of its 5 minutes. Retries (a 502, 503 or 504 once, a secondary rate limit up to 3 attempts) come on top of these requests. Reading stops without failing when the REST rate limit
  reports fewer than 100 requests left, GitHub refuses a request for a rate limit, a network problem or a timeout, or the
  `languageSignal` deadline passes (the CLI sets it 60 s before its overall limit); what was counted is kept and
  `authored` is reported. Commits that a refused request (`graphql`, `forbidden`, `http`, `not-found`,
  `invalid-response`, `too-large`) cannot read are skipped. `unauthorized` and an abort of `signal` (the caller's own) still fail the load.
- **Partial parts.** `"authored"` in `meta.partial`: the reading stopped early, the sums count fewer commits than
  asked for. `"authored-cap"`: commits were left out because of `languageCommitCap`; the result is complete for its
  cap. The CLI and the Action print a warning line for each.

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
is public: private repository names never enter the object, and neither do private repositories' languages, bytes or pins; the one exception is `languagesAuthored` with the user's own token and a `languageCommitCap`, which adds up lines per language over private repositories too (language names and sums only, no repository name or commit text). GitHub computes the contribution counts from the side of the token's owner (the viewer). With the user's own token,
contributions to their private repositories are counted in the calendar and the totals like public ones, and
`contributions.private` is 0; no repository name is involved. With another user's token, private work appears only as
`contributions.private` and in the calendar counts, and only when the user shows private contributions on their
profile. A live run with the user's own token loaded and validated a real calendar.

Private repositories stay out of `pinned` and `pushes` too: their names, commit messages and counts are dropped
whatever the token can read, so a personal access token with private access exposes nothing more than the Actions
`GITHUB_TOKEN` does. A status limited to an organization is visible to its members only, so it is dropped too
(`status` is `null`).

Repositories are loaded in pages of `pageSize`, in GitHub's order (stars descending), until there is no next page or
`maxRepositories` is reached; `repositoriesTruncated` is then `true`. A next page without a cursor, or a cursor GitHub
returns twice, fails with `invalid-response` instead of looping. Requests run one after another: the viewer (without
`login`, or with a `cache` or a `languageCommitCap`), the profile with the calendar, then the repository pages, the activity and the weekly commits.

### Pinned repositories, pushes and status

These three come from two extra requests that run after the repository pages and use `contributions.to` (the
calendar's last day), never the clock, so the same GitHub state gives the same object.

- **`pinned`** are the user's pinned **public** repositories, at most 6, in pin order. A private pin is dropped. With no
  public pin, or when the activity request failed, `pinned` is the first 6 loaded repositories that are not forks
  (stars descending, then `nameWithOwner`); with none of those it is `[]`. Each has the repository fields of
  `repositories[]` and `weeklyCommits`.
- **`weeklyCommits`** has 52 numbers, oldest week first. The weeks are 7-day UTC blocks counted back from the day after
  `contributions.to`; the last one covers `contributions.to` and the 6 days before it. A number counts the commits **of
  the user** (author filter by the user's id) on the repository's default branch in that week. A repository without a
  default branch (empty) has 52 zeros. When the weeks request failed, or GitHub did not return the repository, it is
  `null`.
- **`pushes`** are the user's commits of the last 7 days (`contributions.to` and the 6 days before it, UTC) to the
  default branch of up to 10 repositories GitHub lists in the contributions collection, at most 10 commits per
  repository, newest first, at most 10 in all. A commit appears once. Commits in **private repositories are dropped**
  with any token, as are private pins; `repository` is the name without owner and `message` the first line, cut at 1024
  UTF-16 units on a code point boundary.
- **`status`** is the profile status (`message`, `emoji` as a shortcode), `null` when none is set or when it is
  limited to an organization.

Both requests are best effort: `graphql`, `forbidden`, `not-found`, `invalid-response`, `http` and `too-large`
failures of them do not fail the load. The activity request then leaves `status` `null`, `pushes` `[]` and `pinned`
at its fallback, the weeks request leaves `weeklyCommits` `null`, and `meta.partial` names the part (`"activity"`,
`"weeks"`). A token that may not read these fields (the Actions `GITHUB_TOKEN` or a fine-grained token, depending on its
permissions) ends up here. Failures that
would fail the profile request just the same still fail the load: `unauthorized`, rate limits, `network` and
`timeout` (an abort too). A load with `activity`, `weeks` or `authored` in `meta.partial` is not cached. The CLI and the Action each print one warning line naming the
parts and the fields they leave empty.

## Errors

Every failure is a `GitHubDataError`, a `DataSourceError` whose `source` is `github`; the codes that
[all sources share](data-sources.md#errors) keep their meaning, and `secondary-rate-limited`, `http` and `graphql` are GitHub's own. A GraphQL `errors` entry of the profile or a repository page fails the whole load: no partial data object is ever
returned for it (the optional parts are the exception, see `meta.partial`). Messages never contain the token. An `invalid-response` message names only the JSON path that failed, never
the value; a `graphql` message quotes GitHub's own error messages, redacted and shortened.

| code                     | when                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-token`          | no token, or only whitespace                                                                                                                      |
| `invalid-option`         | an option out of range, an invalid `login`, a token with whitespace or control bytes, or no `login` with an app or Actions token (`GITHUB_TOKEN`) |
| `unauthorized`           | HTTP 401: the token is wrong or expired                                                                                                           |
| `forbidden`              | HTTP 403 that is not a rate limit (for example a missing scope)                                                                                   |
| `not-found`              | no user with that login                                                                                                                           |
| `rate-limited`           | the primary rate limit is exhausted; `resetAt` says when it resets                                                                                |
| `secondary-rate-limited` | a secondary rate limit outlasted the allowed wait or attempts; `retryAfterSeconds`                                                                |
| `http`                   | any other non-2xx status (a 502, 503 or 504 after one retry)                                                                                      |
| `network`                | the API could not be reached; `causeCode` such as `ECONNRESET` when known                                                                         |
| `timeout`                | `requestTimeoutMs` passed, or `signal` aborted (a `languageSignal` abort is a partial `authored`, not an error)                                   |
| `invalid-response`       | a body that is not JSON or does not match the expected shape, types or ranges                                                                     |
| `graphql`                | GitHub answered with GraphQL errors (up to 3 types and messages, redacted, shortened)                                                             |
| `too-large`              | a response body over 8 MiB                                                                                                                        |

Every value is validated before use: types, non-negative integer counts, dates and timestamps, a calendar without gaps
whose weekdays match the dates and whose day counts do not exceed the total GitHub reports (`contributions.total` is the sum of the calendar days; GitHub counts its whole window, which can reach a day or two before the first calendar column), `https://` URLs, and `#rrggbb` colours.
Values that GitHub passes through from users (`websiteUrl`, `homepageUrl`, colours) become `null` instead of failing.
Strings are otherwise kept as GitHub returns them; the renderer escapes them.

## Rate limits

- **Primary** (200 with a `RATE_LIMITED` error, or 403/429 with `x-ratelimit-remaining: 0`): fails at once with
  `rate-limited` and `resetAt`; the loader never waits for a reset.
- **Secondary** (429, or 403 with `retry-after` or a "secondary rate limit" message): waits `retry-after` seconds (60
  when absent) and retries, at most 3 attempts in all. A wait above `maxRetryWaitSeconds` fails at once with
  `secondary-rate-limited` and `retryAfterSeconds`.
- 502, 503 and 504 are retried once after one second.
- A full load sends 1 + ceil(`maxRepositories` / `pageSize`) requests, plus 1 for the viewer (without `login`, or with
  a `cache`), plus the activity request and, when there are repositories to count, the weekly-commit request (2 more, none for the
  weekly commits of an account without repositories), plus retries, and with a `languageCommitCap` the extra budget of [Languages from your own commits](#languages-from-your-own-commits) (plus retries): 7 with the defaults, 14 at most with `pageSize` 100.
  The activity request costs about 1 point. GitHub's estimate for the weekly-commit request is 3 points for 6
  repositories (52 `history` counts each); it grows with the number of repositories asked for, at most 6, `meta.cost`
  reports what GitHub charged. With a `languageCommitCap`, [Languages from your own commits](#languages-from-your-own-commits)
  states the extra budget; the REST requests count in `meta.requests`, while `rateLimitRemaining` and `resetAt` stay
  those of the GraphQL limit. GitHub's REST limit is separate; reading stops when it reports fewer than 100 left.

## Cache

The CLI (`--cache-dir`) and the Action (`cache-dir`) pass a `FileCache` on a folder the host chooses.

With a `cache`, the validated GitHub responses of a load (profile, pages, activity and weeks) are stored as one entry (activity as GitHub answered it minus what the parser drops: private pinned items, private repositories with their commit headlines, an organisation-only status; what the token's own contribution counts and commit sums reveal is stored) and a later load within
`cacheTtlSeconds` sends only the viewer request. A hit is
validated again and rebuilt by the current code, so a changed loader needs no invalidation, and an entry that fails
validation, or belongs to another login, is a miss and is replaced.

An entry belongs to a pair of token owner and login. GitHub answers about contributions from the side of the token's
owner (see [Repositories and privacy](#repositories-and-privacy)), so the owner is resolved with the viewer request
even when `login` is given, and a load with another user's token never reads the owner's entry. The key is the
SHA-256 hex digest of the namespace (`github`), the data version, a hash of the query text, the viewer and the login (both lowercased),
`pageSize`, `maxRepositories` and, only when not empty or above 0, `excludeRepositories`, `languageCommitCap` and the table version. It never covers the token, so two tokens of the same owner share an entry. The key is built by
`dataSourceCacheKey` of `@readmint/data`; since the namespace joined it, entries written by earlier versions miss once
and are refilled.

The owner may be an app: the Actions `GITHUB_TOKEN` and other app installation tokens belong to a bot such as
`github-actions[bot]`, which works as a cache owner. Such a token needs `login`; in viewer mode a bot owner fails with
`invalid-option`, and `login` itself never takes a `[bot]` name.

The cache is best effort. When `login` is given and the owner request fails with `graphql`, `forbidden`,
`invalid-response` or `not-found`, the load runs without the cache (no lookup, no write); `unauthorized`, rate limits,
`network` and `timeout` still fail the load, as the profile request would. A cache that fails to read counts as a miss
and a failed write is ignored, so a read-only or full cache directory never fails a load whose data was loaded.

`FileCache` writes one `<key>.json` file per entry, `{ storedAt, ttlSeconds, value }`: the directory with mode
`0o700` when it creates it, files with mode `0o600`, through a temporary file and a rename. A file over 16 MiB, a
corrupt file or an expired entry is a miss.

With a `languageCommitCap` the entry also holds the summed lines and whether the cap left commits out; an entry without them misses. Each commit read is cached on its own (namespace `github-commit`, keyed by the viewer, repository, commit id and table version, 604800 seconds, since a commit never changes), also by a load that stopped early, so a retry or a larger cap sends no request for a commit already read. A load with `authored-cap` is stored; a hit reports it again.

A load with `activity`, `weeks` or `authored` in `meta.partial` is not written, so a retry asks GitHub again instead of serving the gap until the
entry expires. The key covers the query text, so entries of the format before the activity and weekly commits miss.

## Token

The token is only ever sent in the `Authorization` header of requests to `https://api.github.com/graphql` and, with a `languageCommitCap`, GET requests to `https://api.github.com/repos/...` (redirects
are refused; an empty, `.` or `..` path segment is refused before the request). It is never put in a URL, a request body, an error message, the data object, `meta`, a cache key or a
cache entry, and errors carry no `cause`. A GitHub message that echoes a token, or anything shaped like a GitHub token
(`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), is redacted to `***`. A token with whitespace or control
characters is refused before any request (it could inject a header). Tests check all of this with a canary token on
every error path.

## Versioning

`version` is `GITHUB_DATA_VERSION`. Adding a field keeps the version; renaming or removing a field, or changing its
meaning or type, bumps it. Designs bind to the object as `{ github: data }`; the design format version does not change
with it. The general bump rule is in [data-sources.md](data-sources.md#data-object).

## Tests and the live run

The tests replay recorded GitHub responses of a synthetic user (`packages/data-github/test/fixtures`) with no
network. One live run against GitHub uses the user's token from an environment variable, never printed:

```bash
READMINT_GITHUB_TOKEN="$(gh auth token)" pnpm vitest run --project node packages/data-github/test/live.test.ts
```

Without `READMINT_GITHUB_TOKEN` the live test is skipped and sends no request.
