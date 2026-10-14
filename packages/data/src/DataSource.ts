import type { DataObject } from "./DataObject.js";
import type { DataSourceLoadOptions } from "./DataSourceLoadOptions.js";
import type { DataSourceLoadMeta, DataSourceLoadResult } from "./DataSourceLoadResult.js";

/** Version of this interface; it changes only with a breaking change to the members below. */
export const DATA_SOURCE_INTERFACE_VERSION = 0;

/** What a `data-*` plugin exports and a host (CLI, Action, editor) consumes. */
export interface DataSource<
  Options extends DataSourceLoadOptions,
  Data extends DataObject,
  Meta extends DataSourceLoadMeta = DataSourceLoadMeta,
> {
  readonly interfaceVersion: typeof DATA_SOURCE_INTERFACE_VERSION;
  /** Root name of the data object in expressions; see `isDataNamespace`. */
  readonly namespace: string;
  /** Version of the data object, equal to `data.version` of every load. */
  readonly dataVersion: number;
  load(options: Options): Promise<DataSourceLoadResult<Data, Meta>>;
}
