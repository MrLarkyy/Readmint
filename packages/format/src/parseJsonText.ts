import type { DesignResult } from "./DesignResult.js";
import { designFailure } from "./designFailure.js";
import { IssueCollector } from "./IssueCollector.js";
import { LineIndex } from "./LineIndex.js";
import { scanJson } from "./scanJson.js";

/** JSON text to a plain value; issues carry line and column. */
export function parseJsonText(text: string): DesignResult<unknown> {
  const issues = new IssueCollector();
  const valid = scanJson(text, new LineIndex(text), issues);
  if (!valid || !issues.isEmpty) return designFailure(issues.issues, issues.truncated);
  return { ok: true, value: JSON.parse(text) as unknown };
}
