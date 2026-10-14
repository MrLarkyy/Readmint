import type { ExpressionError } from "./ExpressionError.js";

export type ExprResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ExpressionError };
