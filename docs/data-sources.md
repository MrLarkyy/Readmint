# Data sources

A data source loads data from one upstream service and returns a plain-JSON data object that designs bind to by its
namespace (`github.*`). Sources are plugins (`data-*` packages) that implement one small interface from
`@readmint/data`; hosts (CLI, Action, editor) consume sources only through it. `@readmint/data` has no dependencies and
its main entry imports no `node:` module, so it runs in Node 22 and in the browser; the `@readmint/data/node` subpath
holds `FileCache` for Node only. Four sources exist: the GitHub source,
[`@readmint/data-github`](data-github.md); the JSON source, `@readmint/data-json`
([The JSON source](#the-json-source)), which binds any JSON document, a repository file or an https URL; the feed
source, `@readmint/data-feed` ([The feed source](#the-feed-source)), which binds the latest entries of an RSS or Atom
feed; and the WakaTime source, `@readmint/data-wakatime` ([The WakaTime source](#the-wakatime-source)), which binds
the coding time, languages, editors and operating systems of a WakaTime account; and the registry source,
`@readmint/data-registry` ([The registry source](#the-registry-source)), which binds the latest versions of npm
packages and Maven Central artifacts.

## The interface

```ts
import { DATA_SOURCE_INTERFACE_VERSION, type DataSource } from "@readmint/data";

interface DataSource<
  Options extends DataSourceLoadOptions,
  Data extends DataObject,
  Meta extends DataSourceLoadMeta = DataSourceLoadMeta,
> {
  readonly interfaceVersion: typeof DATA_SOURCE_INTERFACE_VERSION; // 0
  readonly namespace: string;
  readonly dataVersion: number;
  load(options: Options): Promise<{ data: Data; meta: Meta }>;
}
```

`interfaceVersion` is `DATA_SOURCE_INTERFACE_VERSION` (0). It changes only with a breaking change of the members
above or of the rules below; adding an optional member or a common error code does not. A host refuses a source whose
version it does not know. A source is a frozen descriptor object, not a class; `checkDataSource(value)` validates
one (own properties only) and throws a `TypeError` naming the failing member: an unsupported `interfaceVersion`, an
invalid `namespace`, a `dataVersion` that is not a non-negative integer, a `load` that is not a function.

### Namespace

The namespace is the root name of the data object in expressions. It is a lowercase letter followed by up to 31
lowercase letters or digits, and not `true`, `false` or `null` (`isDataNamespace`). That is always a valid expression
root and needs no hyphen rules.

## Data object

- Plain JSON only, with `version` equal to the source's `dataVersion` (`DataObject`).
- The same upstream state gives the same object: facts about the load (`requests`, `fromCache`, rate limits) go to
  `meta`, never into `data`. `meta` extends `DataSourceLoadMeta` (`requests`, `fromCache`).
- Adding a field keeps `dataVersion`; renaming or removing a field, or changing its meaning or type, bumps it.

## Load options

`DataSourceLoadOptions` has `signal` (an `AbortSignal`), `cache` (a `DataSourceCache`) and `cacheTtlSeconds`; a source
adds its own (a token, a login) and extends this type. An invalid option rejects with `invalid-option` before any I/O.
Secrets are passed as options only: never in the data object, `meta`, a cache key or an error.

## Errors

A failed load rejects with a `DataSourceError<Code>`: `source` (the namespace), `code` and a message. It has no
`cause`, and a `secret` given to the constructor is replaced by `***` in the message and not kept. The common codes
(`DATA_SOURCE_COMMON_ERROR_CODES`, type `DataSourceCommonErrorCode`) are `missing-token`, `invalid-option`,
`unauthorized`, `forbidden`, `not-found`, `rate-limited`, `network`, `timeout`, `invalid-response` and `too-large`, so
a host can map failures (exit codes, messages) without knowing the source. A source may add codes of its own (GitHub:
`secondary-rate-limited`, `http`, `graphql`) and subclass `DataSourceError` for extra fields. An aborted `signal`
rejects with `timeout`.

## Cache

A `DataSourceCache` is `get(key)` (the stored text or `undefined`) and `set(key, value, ttlSeconds)`. Values are JSON
text and validated again on read. The cache is best effort: a failed read is a miss and a failed write is ignored.
Keys come from `dataSourceCacheKey(source, input)`, the SHA-256 hex digest (64 lowercase characters, `sha256Hex`) of the
namespace, the data version and the input fields. The digest is one-way: an input may be a URL with a secret query value, and neither the URL nor the
secret is in the key or in a `FileCache` file name (`<64 hex>.json`). A secret inside an input, including a URL query
value, must be high-entropy: the rest of the URL is public, so a short one (`?pin=1234`) can be guessed against the digest
by anyone who can list the cache. The key does not protect the stored value: a cached body is as
sensitive as the URL it came from (`FileCache` writes entries with mode 0o600 and a directory it creates with 0o700; an existing directory keeps its mode, and Windows ignores modes). A non-finite number (`NaN`, `Infinity`) throws a `TypeError` naming the field. `MemoryCache` (browser-safe, `{ now?, maxEntries? }`,
32 entries by default) comes from `@readmint/data`, `FileCache` (Node only) from `@readmint/data/node`; both work with any
source, and `@readmint/data-github` re-exports them unchanged.

## Response bodies

`readBodyCapped(response, maxBytes, fail)` reads a `fetch` response body as UTF-8 text and refuses it once it exceeds
`maxBytes`: first by a declared `content-length`, then by counting the streamed bytes (the stream is cancelled), so a
lying or absent header cannot make a source buffer an unbounded body. `fail(reason)` builds the error it throws, with
`reason` `too-large` or `not-utf8` (type `ReadBodyFailure`), so each source keeps its own error type and wording; every
source reads every body through it.

## Https documents

`fetchHttpsText(url, context)` is the GET the JSON and the feed source share (`FetchHttpsContext`, result
`FetchedText` `{ text, requests }`): redirects followed by hand, at most `HttpsLimits.maxRedirects` (3), each target
checked by `checkHttpsUrl` (https only, no user name or password, no whitespace or control character, at most
`HttpsLimits.maxUrlLength`, 2048 characters; it returns the `URL` or the reason, never quoting the URL); `headers` sent
only while a hop stays on the origin of the first URL; no cookies; one `timeoutMs` for every hop and the body; the
`content-type` checked by the source's check, built with `mediaTypeCheck`; the body read through `readBodyCapped`. Every failure is a
`DataSourceError` of the context's `namespace` whose message is fixed text built from the context's `label` ("The
`<label>` URL answered HTTP 404.", "The `<label>` document is larger than ... bytes.", "The `<label>` request timed out
or was aborted."), never a URL, a header or an upstream message. The rules are listed under [URLs](#urls).

`mediaTypeCheck(types, suffix, kind)` builds that check: it returns `(value: string | null) => string | undefined`, the
reason a `content-type` is refused or `undefined`. It accepts the `types` (lower case `type/subtype` essences) and any
`application/*+<suffix>` type, with no charset or UTF-8; `suffix` is a plain word (`json`, `xml`) placed into a regular
expression, so it is a constant of the source, never input. The reasons are `has no content type`,
`has content type "<type>", not <kind>` and `has charset "<charset>", not UTF-8`, the quoted part cut at 64 characters
with anything unprintable shown as `?`.

## Host duties

- One source per namespace; bind the results as an object keyed by namespace (`{ github: data }`).
- Run `checkDataSource` when a source is registered.
- Map `DataSourceError.code` to the host's own exit codes or messages; never print anything but the error message.

## A minimal source

```ts
import {
  DATA_SOURCE_INTERFACE_VERSION,
  DataSourceError,
  type DataObject,
  type DataSource,
  type DataSourceLoadOptions,
} from "@readmint/data";

interface FakeData extends DataObject {
  readonly version: 0;
  readonly value: string;
}

interface FakeOptions extends DataSourceLoadOptions {
  readonly value?: string;
}

export const fakeSource: DataSource<FakeOptions, FakeData> = Object.freeze({
  interfaceVersion: DATA_SOURCE_INTERFACE_VERSION,
  namespace: "fake",
  dataVersion: 0,
  load(options: FakeOptions) {
    if (options.value === undefined) {
      return Promise.reject(new DataSourceError("fake", "invalid-option", "value is required"));
    }
    const data: FakeData = { version: 0, value: options.value };
    return Promise.resolve({ data, meta: { requests: 0, fromCache: false } });
  },
});
```

## The JSON source

`@readmint/data-json` binds one JSON document, a file or an https URL, under a namespace the host chooses. It is what
the CLI `--data-json` ([cli.md](cli.md#json-data)) and the Action `data-json` input ([action.md](action.md#json-data))
load. Its main entry is browser-safe (global `fetch`, no `node:` module, no `process`); files are read through a reader
the host passes, and `@readmint/data-json/node` has the Node one, `workspaceFileReader(root)`. It has no dependency but
`@readmint/data`. A namespace the host chooses must not equal a `let` name of the design (a `let` never hides a data
name, [design-format.md](design-format.md#local-bindings-let)); the CLI checks it before loading.

```ts
import { jsonDataSource, loadJsonData } from "@readmint/data-json";
import { workspaceFileReader } from "@readmint/data-json/node";

const { data } = await loadJsonData({
  source: "data/stats.json",
  namespace: "stats",
  readFile: workspaceFileReader(process.cwd()),
});
// data = { version: 0, document: { ...the parsed file } }, bound as { stats: data }
```

`jsonDataSource` is the frozen descriptor (`namespace` `json`, `dataVersion` 0, `load` = `loadJsonData`).

### Options

| option            | default        | meaning                                                                                                         |
| ----------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `source`          | (required)     | a relative file path, or an `https://` URL                                                                      |
| `namespace`       | `json`         | the namespace errors name and the host binds the data under; must pass `isDataNamespace`                        |
| `headers`         | none           | URL sources only: header name to the name of the environment variable holding its value, at most 8              |
| `env`             | none           | where header values are read; the source never reads the process environment itself                             |
| `readFile`        | none           | `(relative, maxBytes) => Promise<Uint8Array>`; required for a file source (`workspaceFileReader(root)` in Node) |
| `fetch`           | global `fetch` | injectable for tests                                                                                            |
| `maxBytes`        | 1 MiB          | document size, 1 byte to 8 MiB (the CLI's fixture limit)                                                        |
| `timeoutMs`       | 10000          | the whole URL load, every redirect and the body included, 1000 to 60000                                         |
| `cache`           | none           | a `DataSourceCache`, used for URL loads without headers only                                                    |
| `cacheTtlSeconds` | 3600           | 1 to 604800                                                                                                     |
| `signal`          | none           | ends the load early (`timeout`)                                                                                 |

Every option is checked before any I/O (`invalid-option`); the limits are `JsonLimits`.

### Data object

The data object is `{ version: 0, document: <the parsed JSON> }` (`JsonData`, `JSON_DATA_VERSION`), whatever the
document is: an object, an array or a single value. One shape binds every document (`stats.document.stars`,
`stats.document[0]`), and a document with its own top-level `version` (a `package.json`, most APIs) keeps it at
`document.version` while `version` stays the data object's version, as every source's is. Objects are rebuilt as
plain own properties in document key order (as JavaScript orders keys: integer-like keys first, ascending), so a
`__proto__` key is an ordinary key and pollutes nothing. The same bytes give the same object, from a file, a URL or
the cache: the same document renders the same SVG bytes.

### Files

A file source is a relative path, `/`- or `\`-separated, without `..` segments, control characters, a colon, a
Windows device name (`con`, `nul`, `com1`, ...) or a leading slash or backslash (so no absolute, UNC or device path) and
without a drive letter; at most 1024 characters. `workspaceFileReader(root)` then resolves the root and the file
through every link and junction and refuses (`forbidden`) a file whose real path is outside the real root; it opens
that real path and refuses one that is not the regular file it checked (same device and inode), so swapping the file
itself between the check and the open is caught. A folder on the path swapped for a link inside that short window is not
detected: that cannot be closed portably. A missing file is `not-found`, a folder `invalid-option`, an unreadable one `forbidden`,
one over `maxBytes` `too-large`; messages quote the relative path, never the root. File loads are never cached.

### URLs

- Only `https://` is fetched; another scheme (`http:`, `file:`, ...) and a URL with a user name or password,
  whitespace or more than 2048 characters are `invalid-option` before any request.
- Redirects are followed by hand, at most 3, each target checked by the same rule (a redirect to `http:` is
  `invalid-response`, as is a fourth redirect). Headers are sent only while the request goes to the origin of the
  source URL: a redirect to another origin drops them. Requests send no cookies (`credentials: "omit"`). The browser-safe entry cannot follow a redirect at all: a
  `fetch` with `redirect: "manual"` returns an opaque response there, so every redirect is `invalid-response`.
- A 2xx answer must have a JSON content type (`application/json`, `application/*+json`, `text/json`) or `text/plain`
  (as raw.githubusercontent.com serves JSON), with no charset or UTF-8; anything else (an HTML error page, a missing
  type, `latin1`) is `invalid-response` naming the type.
- 401 is `unauthorized`, 403 `forbidden`, 404 `not-found`, 429 `rate-limited`, any other status `invalid-response`
  naming it; a transport failure is `network` and an abort or the time limit `timeout`, both with fixed text.
- The body goes through `readBodyCapped` (`too-large` over `maxBytes`, `invalid-response` when not UTF-8).
- The URL is chosen by the operator (a CLI argument, an Action input), never by a design, so the source does not block
  private or local addresses: global `fetch` exposes no resolved address to check (a DNS answer can change between a
  check and the connection), and a block would refuse legitimate intranet APIs of the operator.

### Parsing

One leading byte order mark is accepted; the bytes must be valid UTF-8. Before `JSON.parse` a linear scan refuses a
document nested deeper than 64 arrays and objects (`too-large`), so a hostile document cannot overflow the stack;
more than 200000 values is `too-large` too. A syntax error, a number beyond a double (`1e400`) and invalid UTF-8 are
`invalid-response`; no message quotes the document or the parser's text.

### Headers and secrets

Header names are HTTP tokens, lower-cased, at most 8, never `host`, `content-length`, `transfer-encoding`,
`connection` or another hop-by-hop header; headers with a file source are `invalid-option`. Each value is read from
`env` by the variable name given (a missing or blank variable is `missing-token` naming the variable and the header)
and must be printable ASCII (`invalid-option` otherwise, without the value). No error, result, cache key or cache
entry holds a value: messages are fixed text and names, and every message is redacted of each value once more before
it leaves the source.

### Cache

A URL load without headers uses `cache` when one is given: the key is `dataSourceCacheKey` of the namespace, the data
version, the URL and `maxBytes` (no header name or value), the value the response text, parsed and checked again on
read (a bad entry is a miss). A URL load with headers never reads or writes the cache, since its answer depends on a
credential and a cache may be shared. The key and the entry name never hold the URL or its query; the cached body is as sensitive as
the URL. The CLI and the Action pass no cache to JSON and feed loads (their cache folder serves GitHub, WakaTime and registry data only): each run loads the documents again.

### Editor

The editor never fetches: a JSON document is given to it as fixture data under its namespace, as
`{ "<namespace>": { "version": 0, "document": ... } }` ([editor.md](editor.md)).

## The feed source

`@readmint/data-feed` binds the latest entries of one RSS 2.0 or Atom 1.0 feed (blog posts, release notes, videos)
from an https URL, under a namespace the host chooses. It is what the CLI `--data-feed` ([cli.md](cli.md#feed-data))
and the Action `data-feed` input ([action.md](action.md#feed-data)) load. Its only entry is browser-safe (global
`fetch`, no `node:` module, no `process`), and it has no dependency but `@readmint/data`: the XML parser is its own, a
small strict one (see [XML](#xml)).

```ts
import { feedDataSource, loadFeedData } from "@readmint/data-feed";

const { data } = await loadFeedData({
  url: "https://blog.example/feed.xml",
  namespace: "blog",
  limit: 3,
});
// data = { version: 0, title: "...", link: "https://blog.example/", entries: [
//   { title: "...", link: "https://blog.example/posts/a", published: "2026-10-16T12:30:00.000Z", summary: "..." },
//   ...newest first, at most 3 ] }, bound as { blog: data }
```

`feedDataSource` is the frozen descriptor (`namespace` `feed`, `dataVersion` 0, `load` = `loadFeedData`). A design
shows the newest entry as `{{ blog.entries[0].title }}` and its date as
`{{ blog.entries[0].published | date("d MMM yyyy") }}`. `published` is `null` when the feed gives no readable date;
`date` passes `null` through (empty text), so `| default("undated")` after it supplies a placeholder. A list of
entries is `repeat: { each: "{{ blog.entries }}" }`.

### Options

| option            | default        | meaning                                                                                  |
| ----------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `url`             | (required)     | the feed's `https://` URL                                                                |
| `namespace`       | `feed`         | the namespace errors name and the host binds the data under; must pass `isDataNamespace` |
| `limit`           | 5              | entries kept after sorting, 1 to 50                                                      |
| `fetch`           | global `fetch` | injectable for tests                                                                     |
| `maxBytes`        | 1 MiB          | document size, 1 byte to 8 MiB                                                           |
| `timeoutMs`       | 10000          | the whole load, every redirect and the body included, 1000 to 60000                      |
| `cache`           | none           | a `DataSourceCache`                                                                      |
| `cacheTtlSeconds` | 3600           | 1 to 604800                                                                              |
| `signal`          | none           | ends the load early (`timeout`)                                                          |

Every option is checked before any I/O (`invalid-option`, never quoting the URL); the limits are `FeedLimits`. The URL
follows the [URL rules](#urls) of the JSON source through the shared [`fetchHttpsText`](#https-documents): https only,
at most 3 redirects, no cookies, no header but `accept`. A 2xx answer must be `application/rss+xml`,
`application/atom+xml`, `application/xml`, `text/xml`, another `application/*+xml` type or `text/plain`, with no
charset or UTF-8; anything else (an HTML page, `latin1`) is `invalid-response` naming the type. Authenticated feeds,
podcast enclosures and images are out of scope: entries carry text and a link only.

### Data object

`{ version: 0, title, link, entries }` (`FeedData`, `FEED_DATA_VERSION`), each entry `{ title, link, published,
summary }` (`FeedEntry`). The object, its `entries` array and every entry are frozen.

| field       | RSS 2.0 (`<rss><channel>`, `<item>`)                     | Atom 1.0 (`<feed>`, `<entry>`)                                       |
| ----------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `title`     | `title`, read as HTML                                    | `title`, by its `type` (`text`, `html`, `xhtml`)                     |
| `link`      | `link`, else `guid` unless it says `isPermaLink="false"` | the first `link` with `rel="alternate"` or without `rel`, its `href` |
| `published` | `pubDate`, else `dc:date`                                | `published`, else `updated`                                          |
| `summary`   | `description`, else `content:encoded`, read as HTML      | `summary`, else inline `content` (not one given by `src`), by `type` |

The feed's own `title` and `link` are read the same way from the channel or the feed. A missing text is `""`.

- **Text** is always plain text: HTML is turned into text (tags and comments dropped, `script`, `style` and `template`
  content dropped, a space at each block element, character references and a fixed set of named entities such as
  `&nbsp;`, `&mdash;` and `&hellip;` decoded, an unknown one kept as written); control characters are removed, every
  run of whitespace becomes one space and the ends are trimmed. A title has at most 200 code points and a summary 500:
  a longer one is cut at a code point to 199 or 499 and ends in `…`. Nothing in the data is markup, and the renderer
  escapes text like any other.
- **Links** are resolved against the feed URL as given (not a redirect target) without its query, so a key in the
  query never reaches the data; only absolute `http:` and `https:` links without a user name or password and of at
  most 2048 characters are kept, anything else (`javascript:`, `data:`, a broken link) is `""`.
- **Dates** are UTC ISO 8601 strings (`2026-10-16T12:30:00.000Z`) or `null`. RFC 3339 (Atom, `dc:date`; a date alone
  is midnight UTC) and RFC 822/1123 (RSS `pubDate`, such as `Fri, 16 Oct 2026 14:30:00 +0200`; zone names `UT`, `GMT`,
  `Z`, `EST`/`EDT`, `CST`/`CDT`, `MST`/`MDT`, `PST`/`PDT`, none meaning UTC, two-digit years as RFC 2822 says) are read
  by hand and computed with `Date.UTC`, never `Date.parse`, whose leniency differs between engines. A field out of
  range, an unknown zone or a year outside 1970 to 9999 is `null`.
- **Order**: entries are sorted newest first; equal dates keep document order, and entries without a date come last
  in document order. Then the first `limit` are kept. The same bytes and limit give the same object, so the same feed
  renders the same SVG bytes.

### XML

The parser reads the document in one forward pass with an explicit stack, so no input can recurse or rescan, and it
is strict:

- Any `<!DOCTYPE` or other markup declaration (`<!ENTITY`, ...) anywhere is `invalid-response`: no DTD is read, so no
  entity is ever declared, expanded or fetched (no billion laughs, no external entity). Only the five predefined
  entities (`&lt;` `&gt;` `&amp;` `&quot;` `&apos;`) and character references to characters XML allows are decoded;
  any other reference is `invalid-response`.
- The bytes must be UTF-8 (one byte order mark accepted) and an XML declaration may name only UTF-8 or US-ASCII;
  UTF-16, ISO-8859-1 and invalid UTF-8 are `invalid-response`. Whitespace before the declaration is tolerated.
- The document must be well-formed and namespace-well-formed: one root, matching tags, quoted attribute values without
  `<`, no duplicate attribute, every prefix bound, no character XML forbids. Comments and processing instructions
  (`<?xml-stylesheet?>`) are skipped; CDATA is text.
- Caps (`too-large`): elements nested deeper than 32, more than 100000 elements, more than 64 attributes on one
  element, a name longer than 256 characters, and the `maxBytes` of the body.
- The root must be RSS 2.0 `<rss>` (no namespace) or Atom 1.0 `<feed>` in `http://www.w3.org/2005/Atom`; RSS 1.0
  (RDF) and anything else is `invalid-response`. Extensions (`media:`, `yt:`, `itunes:`, ...) are parsed and ignored.

No message quotes the document, the URL or a parser position: they are fixed text, and an error that does not come
from the source itself becomes `invalid-response` "The feed load failed.".

### Feed cache

With a `cache` the raw document is stored under `dataSourceCacheKey` of the namespace, the data version, the URL and
`maxBytes`, never `limit`, and only once it parsed: a cached feed is parsed again on every read, under the same rules
and with the limit of that load (a bad entry is a miss). The key and the entry name never hold the URL or its query; the
cached feed is as sensitive as the URL. The CLI and the Action pass no cache to JSON and feed loads (their cache folder serves GitHub, WakaTime and registry data only): each run loads the feeds again.

### Feeds in the editor

The editor never fetches: a feed is given to it as fixture data under its namespace, as
`{ "<namespace>": { "version": 0, "title": ..., "link": ..., "entries": [...] } }` ([editor.md](editor.md)).

## The WakaTime source

`@readmint/data-wakatime` binds the coding stats of one WakaTime account for a range (time spent coding, its biggest
languages, editors and operating systems), under a namespace the host chooses. It is what the CLI `--data-wakatime`
([cli.md](cli.md#wakatime-data)) and the Action `data-wakatime` input ([action.md](action.md#wakatime-data)) load. Its
only entry is browser-safe (global `fetch`, no `node:` module, no `process`), and it has no dependency but
`@readmint/data`.

```ts
import { loadWakaTimeData, wakaTimeDataSource } from "@readmint/data-wakatime";

const { data, meta } = await loadWakaTimeData({
  apiKey: process.env.WAKATIME_API_KEY ?? "",
  namespace: "wakatime",
  range: "last_30_days",
});
// data = { version: 0, range: "last_30_days", totalSeconds: 98766, humanReadableTotal: "27 hrs 26 mins",
//   dailyAverageSeconds: 14109, languages: [{ name: "TypeScript", percent: 53, seconds: 52346 }, ...],
//   editors: [...], operatingSystems: [...] }, bound as { wakatime: data }
// meta = { requests: 1, fromCache: false, partial: false }
```

`wakaTimeDataSource` is the frozen descriptor (`namespace` `wakatime`, `dataVersion` 0, `load` = `loadWakaTimeData`).
A design shows the total as `{{ wakatime.humanReadableTotal }}`, and the languages with
`repeat: { each: "{{ wakatime.languages }}", as: "lang", index: "i" }` and `if: "{{ i < 5 }}"`; the coding-time card
template ([components.md](components.md#coding-time-card)) does this.

### WakaTime options

| option            | default        | meaning                                                                                           |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `apiKey`          | (required)     | the account's API key, trimmed; printable ASCII without spaces                                    |
| `namespace`       | `wakatime`     | the namespace errors name and the host binds the data under; must pass `isDataNamespace`          |
| `range`           | `last_7_days`  | one of `WAKATIME_RANGES`: `last_7_days`, `last_30_days`, `last_6_months`, `last_year`, `all_time` |
| `fetch`           | global `fetch` | injectable for tests                                                                              |
| `sleep`           | a timer        | the wait before a retry; injectable for tests                                                     |
| `maxBytes`        | 2 MiB          | answer size, 1 byte to 8 MiB                                                                      |
| `timeoutMs`       | 15000          | the whole load, the retry, the waits and the body included, 1000 to 60000                         |
| `cache`           | none           | a `DataSourceCache`                                                                               |
| `cacheTtlSeconds` | 3600           | 1 to 604800                                                                                       |
| `signal`          | none           | ends the load early (`timeout`)                                                                   |

Every option is checked before any I/O: an empty key is `missing-token`; a key with a space, a control character (a
CR or LF could add a header) or a non-ASCII character, an unknown range or namespace and an out-of-range number are
`invalid-option`; no message quotes the key. The user is always `current`, the key's own account: another user's stats
(a leaderboard) and other WakaTime-compatible services are out of scope. The limits are `WakaTimeLimits`.

The hosts never take the key as an argument: the CLI and the Action take the name of an environment variable that holds
it, read it, and hide every form of it (`wakaTimeSecretForms(key)`: as given, trimmed, its base64 with and without
padding, and the whole `Authorization` value) from their messages; the Action masks them all before any load.

### WakaTime request

One request, `GET https://wakatime.com/api/v1/users/current/stats/<range>` (`wakaTimeStatsUrl`): the URL is a constant
plus the checked range, never with a query, so the host is fixed and the key is never in a URL. The key goes only into
`Authorization: Basic <base64 of the key>` (`wakaTimeAuthorization`), with `accept: application/json` and
`user-agent: readmint`; no cookies. No redirect is followed: a 3xx answer is `invalid-response` "The WakaTime API
redirected; no redirect is followed." after that one request, so the key never reaches another host. One `timeoutMs`
covers every attempt, wait and body. A 2xx answer must be `application/json` (or `application/*+json`) with no
charset or UTF-8, read through [`readBodyCapped`](#response-bodies).

| answer                 | result                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 200                    | the data; `meta.partial` when the stats say `is_up_to_date: false`                                               |
| 202                    | WakaTime is still calculating: the data it sent, or the empty object, with `meta.partial`                        |
| 401                    | `unauthorized` "WakaTime rejected the API key (HTTP 401)."                                                       |
| 402, 403               | `forbidden`: the account's plan may not cover the range                                                          |
| 404                    | `not-found`                                                                                                      |
| 429                    | waited out once when `Retry-After` is at most 10 seconds; else, or a second time, `rate-limited` naming the wait |
| 500, 502, 503, 504     | retried once after 1 second, then `invalid-response` naming the status                                           |
| 3xx, any other status  | `invalid-response`                                                                                               |
| a body over `maxBytes` | `too-large`                                                                                                      |
| no answer              | `network`, or `timeout` once `timeoutMs` passed or the signal aborted                                            |

Errors are fixed text plus a status or a field name, never the URL, a header, the key or the upstream body; an error
that does not come from the source itself becomes `invalid-response` "The WakaTime load failed.".

### WakaTime data object

`{ version: 0, range, totalSeconds, humanReadableTotal, dailyAverageSeconds, languages, editors, operatingSystems }`
(`WakaTimeData`, `WAKATIME_DATA_VERSION`), each list entry `{ name, percent, seconds }` (`WakaTimeEntry`). The object,
its lists and every entry are frozen.

| field                 | from the stats answer (`data.*`)                 | rule                                                 |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `range`               | the range asked for                              |                                                      |
| `totalSeconds`        | `total_seconds`                                  | whole seconds                                        |
| `humanReadableTotal`  | `human_readable_total`                           | plain text, at most 64 code points; `""` when absent |
| `dailyAverageSeconds` | `daily_average`                                  | whole seconds                                        |
| `languages`           | `languages[]` `{ name, total_seconds, percent }` | see below                                            |
| `editors`             | `editors[]`, the same fields                     | see below                                            |
| `operatingSystems`    | `operating_systems[]`, the same fields           | see below                                            |

- Field names follow the public WakaTime API v1 documentation of the stats endpoint; the test fixture
  (`packages/data-wakatime/test/fixtures/stats-last_7_days.json`) is shaped after it. Only these fields are read:
  projects, machines, dependencies, the user name and everything else in the answer never reach the data or the cache.
- Every number must be finite and not negative, else `invalid-response` naming the field; a missing list is empty.
  Seconds are rounded to whole seconds and `percent` to two decimals.
- A name is plain one-line text: control characters removed, every run of whitespace one space, trimmed, at most 100
  code points (a longer one is cut at a code point to 99 and ends in `…`); an entry whose name is then empty is
  dropped.
- **Order**: most seconds first, equal seconds by name in UTF-16 code-unit order (never the locale's), then the first
  20 are kept. The same answer gives the same object, so the same stats render the same SVG bytes.
- A 202 answer without a `data` object, or without a body, is the empty object (zeros, `humanReadableTotal` `""`,
  empty lists) with `meta.partial`; in a 202 an absent number is 0. The CLI prints one `warning:` line and the Action
  one `::warning::` line for a partial load, and the run succeeds.

`meta` is `WakaTimeLoadMeta`: `{ requests, fromCache, partial }`.

### WakaTime cache

With a `cache`, the normalised data object (not the raw answer) is stored under `dataSourceCacheKey` of the namespace,
the data version, the user `current`, the range, `maxBytes` and an account digest: the SHA-256 of
`readmint-wakatime-account`, a NUL and the key. Two keys never share an entry, and neither the key nor its plain digest
is in the cache key or a `FileCache` file name. An entry is checked and rebuilt on read like an answer (a bad one is a
miss). A partial answer is never stored. The CLI `--cache-dir` and the Action `cache-dir` give WakaTime loads a
`FileCache` in that folder.

### WakaTime in the editor

The editor never fetches and never takes a key: WakaTime stats are given to it as fixture data under the namespace, as
`{ "wakatime": { "version": 0, "range": "last_7_days", "totalSeconds": ..., "humanReadableTotal": ..., ... } }`
([editor.md](editor.md)).

## The registry source

`@readmint/data-registry` binds the latest version of npm packages (with their downloads of the last week) and of Maven
Central artifacts, under a namespace the host chooses. It is what the CLI `--data-registry`
([cli.md](cli.md#registry-data)) and the Action `data-registry` input ([action.md](action.md#registry-data)) load. It
needs no key. Its only entry is browser-safe (global `fetch`, no `node:` module, no `process`), and it has no
dependency but `@readmint/data`.

```ts
import { loadRegistryData, registryDataSource } from "@readmint/data-registry";

const { data, meta } = await loadRegistryData({
  namespace: "registry",
  npm: ["react", "@types/node"],
  maven: ["org.jetbrains.kotlin:kotlin-stdlib"],
});
// data = { version: 0,
//   npm: [{ name: "react", version: "19.3.1", weeklyDownloads: 115400000 }, ...],
//   maven: [{ group: "org.jetbrains.kotlin", artifact: "kotlin-stdlib", latestVersion: "2.2.0", updated: "2025-06-23" }] },
//   bound as { registry: data }
// meta = { requests: 5, fromCache: false, missing: [] }
```

`registryDataSource` is the frozen descriptor (`namespace` `registry`, `dataVersion` 0, `load` = `loadRegistryData`).
A design shows a package as `{{ registry.npm[0].name }}` and `{{ registry.npm[0].version }}`, and the lists with
`repeat`; the libraries card template ([components.md](components.md#libraries-card)) does this.

### Registry options

| option            | default        | meaning                                                                                    |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `npm`             | none           | npm package names (`react`, `@types/node`), at most 20, no duplicate                       |
| `maven`           | none           | Maven coordinates as `group:artifact`, at most 20, no duplicate; at least one entry in all |
| `namespace`       | `registry`     | the namespace errors name and the host binds the data under; must pass `isDataNamespace`   |
| `fetch`           | global `fetch` | injectable for tests                                                                       |
| `sleep`           | a timer        | the wait before a retry; injectable for tests                                              |
| `maxBytes`        | 1 MiB          | size of one answer, 1 byte to 4 MiB                                                        |
| `timeoutMs`       | 30000          | the whole load, every request, retry, wait and body included, 1000 to 120000               |
| `cache`           | none           | a `DataSourceCache`                                                                        |
| `cacheTtlSeconds` | 3600           | 1 to 604800                                                                                |
| `signal`          | none           | ends the load early (`timeout`)                                                            |

Every option is checked before any I/O. A name that is not a valid npm package name (`isNpmPackageName`: at most 214
characters, lowercase, an optional `@scope/` prefix, no `..`, no `?`, `#` or extra `/`) or a coordinate that is not
`isMavenCoordinate` (exactly one colon, each part 1 to 128 characters of letters, digits, `_`, `.` and `-`), a
duplicate, more than 20 entries in a list, no entry at all, an unknown namespace and an out-of-range number are
`invalid-option`; the message names the option and the index (`npm[2] is not a valid npm package name`), never the
value. The limits are `RegistryLimits`.

### Registry requests

One load makes its requests one after another, in the order asked for (npm first), all `GET` over HTTPS, built only from
the validated names, with `accept: application/json` and `user-agent: readmint`, no cookies and no credentials. The
hosts are `REGISTRY_HOSTS`, and no other is ever contacted:

| entry | request                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| npm   | `https://registry.npmjs.org/<name>/latest`, the manifest of the `latest` dist-tag (`@scope/name` as it is; both slash forms answer) |
| npm   | `https://api.npmjs.org/downloads/point/last-week/<name>`                                                                            |
| Maven | `https://search.maven.org/solrsearch/select?q=g:"<group>" AND a:"<artifact>"&rows=1&wt=json` (the query encoded)                    |

No redirect is followed: a 3xx answer is `invalid-response` "The <service> API redirected; no redirect is followed."
after that one request. A 2xx answer must be `application/json` (or `application/*+json`) with no charset or UTF-8,
read through [`readBodyCapped`](#response-bodies).

| answer                                 | result                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 200                                    | the entry                                                                                        |
| 404 of the npm manifest                | the entry is `null`, named in `meta.missing`                                                     |
| 404 of the downloads                   | the entry is kept with `weeklyDownloads` `null`                                                  |
| Maven answer with no matching document | the entry is `null` (a document whose group and artifact are not the ones asked for is no match) |
| 401, 403                               | `forbidden`                                                                                      |
| 429                                    | waited out once when `Retry-After` is at most 10 seconds; else, or a second time, `rate-limited` |
| 500, 502, 503, 504                     | retried once after 1 second, then `invalid-response` naming the status                           |
| 3xx, any other status                  | `invalid-response`                                                                               |
| a body over `maxBytes`                 | `too-large`                                                                                      |
| no answer                              | `network`, or `timeout` once `timeoutMs` passed or the signal aborted                            |

Only a registry that does not know an entry gives `null`; every other failure fails the whole load, so a card with a
silently missing section is never committed. Errors are fixed text plus a status or a field name, never the URL or the
upstream body; an error that does not come from the source itself becomes `invalid-response` "The registry load
failed.". Maven Central's search sometimes answers only after 30 seconds or more; such a load ends `timeout` after
`timeoutMs`, and a re-run usually succeeds.

### Registry data object

`{ version: 0, npm, maven }` (`RegistryData`, `REGISTRY_DATA_VERSION`). Both lists keep the order asked for and are
frozen with their entries; an entry the registry does not know stays in its place as `null`, so `npm[2]` is always the
third package asked for.

| list    | entry                                                           | from                                                                          |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm`   | `{ name, version, weeklyDownloads }` (`NpmPackage`)             | the manifest's `version`; the downloads of the last week, `null` without one  |
| `maven` | `{ group, artifact, latestVersion, updated }` (`MavenArtifact`) | the search document's `latestVersion` and `timestamp` (UTC date `YYYY-MM-DD`) |

A version is printable ASCII, 1 to 64 characters, and the downloads a non-negative safe integer, else
`invalid-response` naming the field. Only these fields are read: the rest of an answer never reaches the data or the
cache. `meta` is `RegistryLoadMeta`: `{ requests, fromCache, missing }`, `missing` the entries asked for and not known
(`npm:<name>`, `maven:<group>:<artifact>`); `fromCache` is true only when every entry came from the cache. The CLI
prints one `warning:` line and the Action one `::warning::` line for them, and the run succeeds.

### Registry cache

With a `cache`, each found entry is stored (validated again on read; a bad one is a miss) under `dataSourceCacheKey` of
the namespace, the data version, the registry, the name and `maxBytes`. An entry the registry does not know is never
stored, and a failing cache neither fails the load nor leaks its error. The CLI `--cache-dir` and the Action `cache-dir`
give registry loads a `FileCache` in that folder.

### The registry in the editor

The editor never fetches: registry entries are given to it as fixture data under the namespace, as
`{ "registry": { "version": 0, "npm": [{ "name": "react", "version": "19.3.1", "weeklyDownloads": 115400000 }], "maven": [] } }`
([editor.md](editor.md)).
