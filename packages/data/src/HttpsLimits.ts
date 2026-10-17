/** Fixed caps of every https load made through `fetchHttpsText`. */
export const HttpsLimits = Object.freeze({
  /** Redirects followed per load. */
  maxRedirects: 3,
  /** Characters of a URL as given and of each redirect target. */
  maxUrlLength: 2048,
});

export type HttpsLimits = typeof HttpsLimits;
