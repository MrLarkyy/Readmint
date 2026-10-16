import { parseDesignProps, type ComponentPropValue, type DesignProps } from "@readmint/format";
import { refuse } from "./commitDesign.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorState } from "./EditorState.js";
import { exportSettings } from "./exportSettings.js";

/**
 * Sets one prop of the chosen settings section, or removes it (`undefined`). A new prop goes last, an edited one keeps
 * its place. The value must pass what the CLI's `--props` file passes (`parseDesignProps` on a file of just this prop),
 * a list at most `EditorLimits.maxSettingsListItems` long, and the exported file stays within
 * `EditorLimits.maxSettingsBytes`. A refused edit leaves the state unchanged but for an issue that names the prop and
 * never quotes the value. Not an undo step: settings are a session input.
 */
export function setSettingsProp(
  state: EditorState,
  prop: string,
  value: ComponentPropValue | undefined,
): EditorState {
  const settings = state.settings;
  if (settings === undefined) return refuse(state, "settings", "no settings file is loaded");
  const section = settings.section;
  if (section === undefined) return refuse(state, "settings", "no settings section is chosen");
  const current = settings.sections[section];
  if (current === undefined) return refuse(state, "settings", "no settings section is chosen");
  const name = JSON.stringify(prop.slice(0, 64));
  const fail = (reason: string) => refuse(state, "settings", `settings prop ${name}: ${reason}`);
  if (value === undefined) {
    if (!Object.hasOwn(current, prop)) return { ...state, issues: [] };
  } else {
    const problem = valueProblem(section, prop, value);
    if (problem !== undefined) return fail(problem);
  }
  const props: Record<string, ComponentPropValue> = Object.create(null) as Record<
    string,
    ComponentPropValue
  >;
  for (const key of Object.keys(current)) {
    if (key === prop) {
      if (value !== undefined) props[key] = value;
    } else props[key] = current[key] as ComponentPropValue;
  }
  if (value !== undefined && !Object.hasOwn(current, prop)) props[prop] = value;
  const sections: Record<string, Readonly<Record<string, ComponentPropValue>>> = Object.create(
    null,
  ) as Record<string, Readonly<Record<string, ComponentPropValue>>>;
  for (const key of Object.keys(settings.sections)) {
    sections[key] = key === section ? props : (settings.sections[key] as never);
  }
  const next = { ...settings, sections: sections as DesignProps };
  const text = exportSettings(next);
  const bytes =
    text.length * 3 > EditorLimits.maxSettingsBytes
      ? new TextEncoder().encode(text).length
      : text.length;
  if (bytes > EditorLimits.maxSettingsBytes) {
    return fail(
      `the settings file would be ${String(bytes)} bytes, more than the ${String(EditorLimits.maxSettingsBytes)} a settings file may have`,
    );
  }
  return { ...state, settings: next, issues: [] };
}

/** Why `value` cannot be the prop's value in the CLI's settings format, or undefined. */
function valueProblem(section: string, prop: string, value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const items = (value as unknown[]).length;
    if (items > EditorLimits.maxSettingsListItems) {
      return `the list has ${String(items)} items, more than the ${String(EditorLimits.maxSettingsListItems)} a prop list may have`;
    }
    if (!(value as unknown[]).every(isScalar))
      return "a list may only hold strings, numbers and booleans";
  } else if (!isScalar(value)) {
    return "the value must be a string, a number, a boolean or a list of those";
  }
  const result = parseDesignProps(JSON.stringify({ [section]: { [prop]: value } }));
  if (result.ok) return undefined;
  return result.issues[0]?.message ?? "the value is not valid";
}

function isScalar(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
