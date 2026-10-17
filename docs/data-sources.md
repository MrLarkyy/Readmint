# Data sources

A data source loads data from one upstream service and returns a plain-JSON data object that designs bind to by its
namespace (`github.*`). Sources are plugins (`data-*` packages) that implement one small interface from
`@readmint/data`; hosts (CLI, Action, editor) consume sources only through it. `@readmint/data` has no dependencies and
its main entry imports no `node:` module, so it runs in Node 22 and in the browser; the `@readmint/data/node` subpath
holds `FileCache` for Node only. Three sources exist: the GitHub source,
[`@readmint/data-github`](data-github.md); the JSON source, `@readmint/data-json`
([The JSON source](#the-json-source)), which binds any JSON document, a repository file or an https URL; and the feed
source, `@readmint/data-feed` ([The feed source](#the-feed-source)), which binds the latest entries of an RSS or Atom
feed.

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
the URL. The CLI and the Action pass no cache to JSON and feed loads (their cache folder serves GitHub data only): each run loads the documents again.

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
cached feed is as sensitive as the URL. The CLI and the Action pass no cache to JSON and feed loads (their cache folder serves GitHub data only): each run loads the feeds again.

### Feeds in the editor

The editor never fetches: a feed is given to it as fixture data under its namespace, as
`{ "<namespace>": { "version": 0, "title": ..., "link": ..., "entries": [...] } }` ([editor.md](editor.md)).
