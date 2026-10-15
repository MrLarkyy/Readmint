import type { DesignIssue } from "./DesignIssue.js";
import type { DesignResult } from "./DesignResult.js";

export function designFailure(
  issues: readonly DesignIssue[],
  truncated = false,
): DesignResult<unknown> {
  return { ok: false, issues, truncated };
}
