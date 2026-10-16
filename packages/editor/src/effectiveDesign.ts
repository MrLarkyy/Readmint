import { applyDesignProps, type Design } from "@readmint/format";
import type { EditorIssue } from "./EditorIssue.js";
import type { EditorState } from "./EditorState.js";

/** The design a render shows and `issues` why the chosen settings section could not be applied. */
export interface EffectiveDesign {
  readonly design: Design;
  readonly issues: readonly EditorIssue[];
}

/**
 * The design the preview and the raster export render: the state's design with the chosen settings section applied
 * (`applyDesignProps`, as `readmint render --props`). Without a section, the design itself. When the section does not
 * apply, the design as it is and the reasons (a message never quotes a value).
 */
export function effectiveDesign(state: EditorState): EffectiveDesign {
  const settings = state.settings;
  const section = settings?.section;
  if (settings === undefined || section === undefined) return { design: state.design, issues: [] };
  const props = settings.sections[section];
  if (props === undefined) return { design: state.design, issues: [] };
  const result = applyDesignProps(state.design, props);
  if (result.ok) return { design: result.value, issues: [] };
  const issues: EditorIssue[] = result.issues.map((issue) => ({
    source: "settings",
    message: `settings /${section}${issue.path}: ${issue.message}`,
  }));
  if (result.truncated)
    issues.push({ source: "settings", message: "more settings issues not shown" });
  return { design: state.design, issues };
}
