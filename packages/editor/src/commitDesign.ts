import { validateDesign } from "@readmint/format";
import type { EditorIssueSource } from "./EditorIssue.js";
import type { EditorState } from "./EditorState.js";

type StateChanges = Partial<Omit<EditorState, "design" | "issues">>;

/**
 * The state with `candidate` as its design when it validates (issues cleared, `changes` applied); otherwise the
 * state unchanged but for the validation issues. The one way a command changes the design.
 */
export function commitDesign(
  state: EditorState,
  candidate: unknown,
  changes: StateChanges = {},
): EditorState {
  const result = validateDesign(candidate);
  if (!result.ok) {
    return {
      ...state,
      issues: result.issues.map((issue) => ({
        source: "design",
        message: issue.message,
        path: issue.path,
      })),
    };
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
