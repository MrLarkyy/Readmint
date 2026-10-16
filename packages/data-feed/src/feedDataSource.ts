import { DATA_SOURCE_INTERFACE_VERSION, type DataSource } from "@readmint/data";
import { FEED_DATA_DEFAULT_NAMESPACE, FEED_DATA_VERSION, type FeedData } from "./FeedData.js";
import type { FeedSourceOptions } from "./FeedSourceOptions.js";
import { loadFeedData } from "./loadFeedData.js";

/**
 * The feed source as a `@readmint/data` plugin. `namespace` is the default; a host binding a feed
 * elsewhere passes `options.namespace`, and the data object is the same either way.
 */
export const feedDataSource: DataSource<FeedSourceOptions, FeedData> = Object.freeze({
  interfaceVersion: DATA_SOURCE_INTERFACE_VERSION,
  namespace: FEED_DATA_DEFAULT_NAMESPACE,
  dataVersion: FEED_DATA_VERSION,
  load: loadFeedData,
});
