import { DesignLimits, validateDesign } from "@readmint/format";
import type { EditorIssueSource } from "./EditorIssue.js";
import type { EditorState } from "./EditorState.js";
import { exportDesign } from "./exportDesign.js";

type StateChanges = Partial<Omit<EditorState, "design" | "issues">>;

/**
 * The state with `candidate` as its design when it validates and its exported file stays within
 * `DesignLimits.maxSourceLength` (what the CLI and an import read): issues cleared, `changes` applied. Otherwise the
 * state unchanged but for the issues, reported under `source`. The one way a command changes the design.
 */
export function commitDesign(
  state: EditorState,
  candidate: unknown,
  changes: StateChanges = {},
  source: EditorIssueSource = "design",
): EditorState {
  const result = validateDesign(candidate);
  if (!result.ok) {
    return {
      ...state,
      issues: result.issues.map((issue) => ({ source, message: issue.message, path: issue.path })),
    };
  }
  const length = exportDesign(result.value).length;
  if (length > DesignLimits.maxSourceLength) {
    return refuse(
      state,
      source,
      `the design file would be ${String(length)} characters long, more than the ${String(DesignLimits.maxSourceLength)} a design may have`,
    );
  }
  return { ...state, ...changes, design: result.value, issues: [] };
}

/** The state unchanged but for one issue saying why a command was refused. */
export function refuse(
  state: EditorState,
  source: EditorIssueSource,
  message: string,
  path?: string,
): EditorState {
  return { ...state, issues: [{ source, message, ...(path === undefined ? {} : { path }) }] };
}
