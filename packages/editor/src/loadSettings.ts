import { parseDesignProps } from "@readmint/format";
import { refuse } from "./commitDesign.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorState } from "./EditorState.js";

/**
 * A settings file (JSON, props by section, as the CLI's `--props` file) from its text, at most `maxSettingsBytes`
 * of UTF-8. `preferredSection` (the imported design's file stem) is applied when the file has it, else no section.
 * A refused file leaves the state unchanged; an issue names a pointer, never a value.
 */
export function loadSettings(
  state: EditorState,
  text: string,
  preferredSection?: string,
): EditorState {
  const fail = (reason: string, path?: string) =>
    refuse(state, "settings", `settings file ${reason}`, path);
  // A UTF-16 code unit is at most 3 bytes of UTF-8: only text near the limit is measured exactly.
  if (text.length * 3 > EditorLimits.maxSettingsBytes) {
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > EditorLimits.maxSettingsBytes) {
      return fail(`is larger than ${String(EditorLimits.maxSettingsBytes)} bytes`);
    }
  }
  const result = parseDesignProps(text);
  if (!result.ok) {
    const issues = result.issues.map((issue) => ({
      source: "settings" as const,
      message: `settings file: ${issue.message}`,
      path: issue.path,
    }));
    if (result.truncated) {
      issues.push({
        source: "settings",
        message: "settings file: more issues not shown",
        path: "",
      });
    }
    return { ...state, issues };
  }
  return {
    ...state,
    settings: { sections: result.value, ...sectionOf(result.value, preferredSection) },
    issues: [],
  };
}

function sectionOf(
  sections: Readonly<Record<string, unknown>>,
  name: string | undefined,
): { section?: string } {
  return name !== undefined && Object.hasOwn(sections, name) ? { section: name } : {};
}
