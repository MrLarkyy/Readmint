export const packageName = "@readmint/data-feed";

export type { FeedData, FeedEntry } from "./FeedData.js";
export type { FeedFetch, FeedSourceOptions } from "./FeedSourceOptions.js";
export { FEED_DATA_DEFAULT_NAMESPACE, FEED_DATA_VERSION } from "./FeedData.js";
export { FeedLimits } from "./FeedSourceOptions.js";
export { feedDataSource } from "./feedDataSource.js";
export { loadFeedData } from "./loadFeedData.js";
