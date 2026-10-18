import type { EditorState } from "./EditorState.js";
import { chosenRender } from "./rendersOfFile.js";

/**
 * The settings section `readmint render --manifest` uses for the chosen render: the render's name when the settings
 * file has that section, else none. Absent `render` means no render is chosen and any section is the user's own.
 */
export function renderSection(state: EditorState): { section: string | undefined } | undefined {
  const render = chosenRender(state.manifest)?.entry;
  if (render === undefined) return undefined;
  const sections = state.settings?.sections;
  return {
    section:
      sections !== undefined && Object.hasOwn(sections, render.name) ? render.name : undefined,
  };
}
