import type { DesignIssue } from "./DesignIssue.js";

export type DesignResult<T> =
  | { readonly ok: true; readonly value: T; readonly migratedFrom?: number }
  | { readonly ok: false; readonly issues: readonly DesignIssue[]; readonly truncated: boolean };
