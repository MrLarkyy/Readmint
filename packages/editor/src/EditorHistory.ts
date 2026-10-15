import type { Design } from "@readmint/format";
import { EditorLimits } from "./EditorLimits.js";
import { withoutSelection, type EditorState } from "./EditorState.js";

/** A design as it was before or after an edit, with the layer selected then. */
export interface HistoryEntry {
  readonly design: Design;
  readonly selection?: string;
}

/**
 * The design edits undo and redo step through, oldest first in `past`, the next redo last in `future`. Fixture data,
 * attached session files and font checks are inputs of the session, never entries: undo keeps them as they are.
 */
export interface EditorHistory {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

/** What undo or redo makes of the current state, and the history after it. */
export interface HistoryStep {
  readonly history: EditorHistory;
  readonly state: EditorState;
}

/** A history with nothing to undo or redo. */
export function createHistory(): EditorHistory {
  return { past: [], future: [] };
}

/**
 * The history after a command took `before` to `after`: unchanged when the design is the same object (a refused
 * command, a selection, data or a session file), else `before` is the newest undo entry and the redo entries are
 * dropped. Beyond `limit` entries the oldest goes.
 */
export function recordEdit(
  history: EditorHistory,
  before: EditorState,
  after: EditorState,
  limit: number = EditorLimits.maxHistory,
): EditorHistory {
  if (after.design === before.design) return history;
  const past = [...history.past, entry(before)];
  return { past: past.slice(Math.max(0, past.length - limit)), future: [] };
}

/** The state before the newest edit, its design and selection restored and its issues cleared; undefined when none. */
export function undo(history: EditorHistory, current: EditorState): HistoryStep | undefined {
  const target = history.past.at(-1);
  if (target === undefined) return undefined;
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, entry(current)] },
    state: restore(current, target),
  };
}

/** The state the newest undo stepped back from; undefined when there is nothing to redo. */
export function redo(history: EditorHistory, current: EditorState): HistoryStep | undefined {
  const target = history.future.at(-1);
  if (target === undefined) return undefined;
  return {
    history: { past: [...history.past, entry(current)], future: history.future.slice(0, -1) },
    state: restore(current, target),
  };
}

export function canUndo(history: EditorHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: EditorHistory): boolean {
  return history.future.length > 0;
}

function entry(state: EditorState): HistoryEntry {
  return state.selection === undefined
    ? { design: state.design }
    : { design: state.design, selection: state.selection };
}

function restore(current: EditorState, target: HistoryEntry): EditorState {
  const state: EditorState = { ...current, design: target.design, issues: [] };
  return target.selection === undefined
    ? withoutSelection(state)
    : { ...state, selection: target.selection };
}
