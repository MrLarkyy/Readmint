/** Reasons every host can map without knowing the source; a source may add its own codes. */
export type DataSourceCommonErrorCode =
  | "missing-token"
  | "invalid-option"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "network"
  | "timeout"
  | "invalid-response"
  | "too-large";

export const DATA_SOURCE_COMMON_ERROR_CODES: readonly DataSourceCommonErrorCode[] = Object.freeze([
  "missing-token",
  "invalid-option",
  "unauthorized",
  "forbidden",
  "not-found",
  "rate-limited",
  "network",
  "timeout",
  "invalid-response",
  "too-large",
]);

export interface DataSourceErrorOptions {
  /** Replaced by `***` in the message and never stored. */
  readonly secret?: string;
}

/**
 * Failure of a load. It carries no `cause`: an upstream error may hold request details, so only
 * a redacted message and plain fields survive.
 */
export class DataSourceError<Code extends string = string> extends Error {
  readonly source: string;
  readonly code: Code;

  constructor(source: string, code: Code, message: string, options: DataSourceErrorOptions = {}) {
    super(options.secret ? message.split(options.secret).join("***") : message);
    this.name = "DataSourceError";
    this.source = source;
    this.code = code;
  }
}
