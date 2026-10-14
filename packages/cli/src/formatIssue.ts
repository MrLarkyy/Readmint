import type { DesignIssue } from "@readmint/format";
import type { RenderIssue } from "@readmint/renderer";

/**
 * One issue as a line: `<name>:<line>:<column>: error <code> at <path>: <message>`, the position
 * only when the issue has one. Not escaped yet: `printLines` does that.
 */
export function formatIssue(
  name: string,
  issue: DesignIssue | RenderIssue,
  severity: "error" | "warning",
): string {
  const line = "line" in issue ? issue.line : undefined;
  const column = "column" in issue ? issue.column : undefined;
  const position =
    line === undefined ? "" : `:${String(line)}${column === undefined ? "" : `:${String(column)}`}`;
  return `${name}${position}: ${severity} ${issue.code} at ${issue.path === "" ? "/" : issue.path}: ${issue.message}`;
}
