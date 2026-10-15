# Data sources

A data source loads data from one upstream service and returns a plain-JSON data object that designs bind to by its
namespace (`github.*`). Sources are plugins (`data-*` packages) that implement one small interface from
`@readmint/data`; hosts (CLI, Action, editor) consume sources only through it. `@readmint/data` has no dependencies and
imports no `node:` module, so it runs in Node 22 and in the browser. The GitHub source is
[`@readmint/data-github`](data-github.md).

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
