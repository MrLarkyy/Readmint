import type { EditorState } from "./EditorState.js";
import type { PropertyActions } from "./PropertyActions.js";

/** What the property panel gives its fieldsets: the actions, the newest state and a way to keep inputs current. */
export interface PanelContext {
  readonly actions: PropertyActions;
  /** The state the panel was last updated with: handlers read the design from it, never from a captured copy. */
  latest(): EditorState;
  /**
   * Shows `read()` in `input` now and again on every update that keeps the panel's structure, except while the input
   * has focus; the panel keeps the same elements then, so focus and typed text survive an edit.
   */
  bind(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, read: () => string): void;
  /** Runs `apply` now and on every update that keeps the panel's structure: labels that show a name use it. */
  refresh(apply: () => void): void;
  /**
   * After the rebuild the next action causes, focuses the control of `kind` at `at` instead of the one at the focused
   * control's place: a control that moves its row follows it.
   */
  focusAfter(kind: string, at: readonly number[]): void;
}
