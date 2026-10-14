import type { DataObject } from "./DataObject.js";

/** Facts about one load, kept out of the data object so the object stays the same between loads. */
export interface DataSourceLoadMeta {
  /** Requests sent to the upstream service, retries included. */
  readonly requests: number;
  readonly fromCache: boolean;
}

export interface DataSourceLoadResult<
  Data extends DataObject,
  Meta extends DataSourceLoadMeta = DataSourceLoadMeta,
> {
  readonly data: Data;
  readonly meta: Meta;
}
