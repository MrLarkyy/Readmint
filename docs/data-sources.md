# Data sources

A data source loads data from one upstream service and returns a plain-JSON data object that designs bind to by its
namespace (`github.*`). Sources are plugins (`data-*` packages) that implement one small interface from
`@readmint/data`; hosts (CLI, Action, editor) consume sources only through it. `@readmint/data` has no dependencies and
its main entry imports no `node:` module, so it runs in Node 22 and in the browser; the `@readmint/data/node` subpath
holds `FileCache` for Node only. Two sources exist: the GitHub source,
[`@readmint/data-github`](data-github.md), and the JSON source, `@readmint/data-json`
([The JSON source](#the-json-source)), which binds any JSON document, a repository file or an https URL.

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
namespace, the data version and the input fields; the input never holds a secret, and a non-finite number (`NaN`, `Infinity`) throws a `TypeError` naming the field. `MemoryCache` (browser-safe, `{ now?, maxEntries? }`,
32 entries by default) comes from `@readmint/data`, `FileCache` (Node only) from `@readmint/data/node`; both work with any
source, and `@readmint/data-github` re-exports them unchanged.

## Response bodies

`readBodyCapped(response, maxBytes, fail)` reads a `fetch` response body as UTF-8 text and refuses it once it exceeds
`maxBytes`: first by a declared `content-length`, then by counting the streamed bytes (the stream is cancelled), so a
lying or absent header cannot make a source buffer an unbounded body. `fail(reason)` builds the error it throws, with
`reason` `too-large` or `not-utf8` (type `ReadBodyFailure`), so each source keeps its own error type and wording; the
GitHub and the JSON source both read every body through it.

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
`@readmint/data`.

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
that real path and refuses one that is not the regular file it checked (same device and inode), so a swap between the
check and the open is caught. A missing file is `not-found`, a folder `invalid-option`, an unreadable one `forbidden`,
one over `maxBytes` `too-large`; messages quote the relative path, never the root. File loads are never cached.

### URLs

- Only `https://` is fetched; another scheme (`http:`, `file:`, ...) and a URL with a user name or password,
  whitespace or more than 2048 characters are `invalid-option` before any request.
- Redirects are followed by hand, at most 3, each target checked by the same rule (a redirect to `http:` is
  `invalid-response`, as is a fourth redirect). Headers are sent only while the request goes to the origin of the
  source URL: a redirect to another origin drops them. Requests send no cookies (`credentials: "omit"`).
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
credential and a cache may be shared. The CLI and the Action pass no cache: each run loads the documents again.

### Editor

The editor never fetches: a JSON document is given to it as fixture data under its namespace, as
`{ "<namespace>": { "version": 0, "document": ... } }` ([editor.md](editor.md)).
