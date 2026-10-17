import type { Design, RenderVariant } from "@readmint/format";
import type { RenderAssets } from "@readmint/renderer";
import type { EditorSettings } from "./EditorSettings.js";
import type { EditorIssue } from "./EditorIssue.js";
import type { FontCheck } from "./FontCheck.js";

/**
 * Everything the editor edits, as one immutable value: every command returns a new state, and a state's design
 * always passes `validateDesign`.
 */
export interface EditorState {
  readonly design: Design;
  /** JSON Pointer of the selected layer under `/layers`. */
  readonly selection?: string;
  /** Fixture data the preview renders with, keyed by data namespace (as the CLI's `--data` file). */
  readonly data: Readonly<Record<string, unknown>>;
  /** A settings file and its applied section; rendered with, never part of the design. */
  readonly settings?: EditorSettings;
  /** The render variant the preview and the raster export apply (`--variant`); session only, never part of the design, its history or an export. */
  readonly variant?: RenderVariant;
  /** Bytes the user attached for path-sourced assets in this session; never exported. */
  readonly sessionAssets: RenderAssets;
  /** The fsType of fonts the editor has read, by asset id. */
  readonly fontChecks: Readonly<Record<string, FontCheck>>;
  /** Issues of the last command; a command that succeeds clears them. */
  readonly issues: readonly EditorIssue[];
}

/** The state with no layer selected. */
export function withoutSelection(state: EditorState): EditorState {
  const copy: { -readonly [K in keyof EditorState]: EditorState[K] } = { ...state };
  delete copy.selection;
  return copy;
}

/** A fresh state for a validated design: no selection, no data, no session assets. */
export function createEditorState(design: Design): EditorState {
  return { design, data: {}, sessionAssets: {}, fontChecks: {}, issues: [] };
}
