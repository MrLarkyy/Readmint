import type { ExpressionError, ExpressionErrorCode } from "./ExpressionError.js";
import type { ExprResult } from "./ExprResult.js";
import { quoteSource } from "./quoteSource.js";
import type { Span } from "./Span.js";

/** Where an error is reported: the compiled text and the `{{ }}` placeholder being worked on. */
export interface ErrorSite {
  readonly source: string;
  readonly segment: Span;
}

/** `message` must not contain any value read from the data: errors reach logs and the editor. */
export function createError(
  site: ErrorSite,
  code: ExpressionErrorCode,
  message: string,
  span: Span,
): ExpressionError {
  return Object.freeze({
    code,
    message: `${message} at column ${String(span.start + 1)}`,
    start: span.start,
    end: span.end,
    excerpt: quoteSource(site.source, site.segment, span.start),
  });
}

export function failWith<T>(
  site: ErrorSite,
  code: ExpressionErrorCode,
  message: string,
  span: Span,
): ExprResult<T> {
  return { ok: false, error: createError(site, code, message, span) };
}
