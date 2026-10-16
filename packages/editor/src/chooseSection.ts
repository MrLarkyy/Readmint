import { refuse } from "./commitDesign.js";
import type { EditorState } from "./EditorState.js";

/** Applies a section of the loaded settings to the design, or none (`undefined`). A section the file lacks is refused. */
export function chooseSection(state: EditorState, section: string | undefined): EditorState {
  const settings = state.settings;
  if (settings === undefined) return refuse(state, "settings", "no settings file is loaded");
  if (section !== undefined && !Object.hasOwn(settings.sections, section)) {
    return refuse(
      state,
      "settings",
      `the settings file has no section ${JSON.stringify(section.slice(0, 64))}`,
    );
  }
  const next: { -readonly [K in keyof typeof settings]: (typeof settings)[K] } = {
    sections: settings.sections,
  };
  if (section !== undefined) next.section = section;
  return { ...state, settings: next, issues: [] };
}
