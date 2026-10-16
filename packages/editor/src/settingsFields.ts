import type { ComponentPropDefinition, ComponentPropValue } from "@readmint/format";
import { declaredProps, layerValue, undeclaredProps } from "./declaredProps.js";
import type { EditorState } from "./EditorState.js";

/** One prop the design declares, as the settings form shows it. */
export interface SettingsField {
  readonly name: string;
  readonly definition: ComponentPropDefinition;
  /** What renders: the section's value, else the layer's own, else the definition's default; none when in none. */
  readonly value?: ComponentPropValue;
  /** Where `value` comes from: the section, the top-level component layer's own props, the definition's default, or nowhere. */
  readonly from: "settings" | "layer" | "default" | "none";
}

/**
 * The fields of the form for the chosen section: every prop a top-level component of the design declares (declaration
 * order, each once), and the section's props nothing declares (`unknown`, at most `DesignLimits.maxIssues`, with
 * `truncated` when there are more). No section chosen: nothing.
 */
export function settingsFields(state: EditorState): {
  fields: SettingsField[];
  unknown: string[];
  truncated: boolean;
} {
  const settings = state.settings;
  const section = settings?.section === undefined ? undefined : settings.sections[settings.section];
  if (section === undefined) return { fields: [], unknown: [], truncated: false };
  const declared = declaredProps(state.design);
  const fields: SettingsField[] = [];
  for (const [name, definition] of declared) {
    const own = layerValue(state.design, name);
    if (Object.hasOwn(section, name)) {
      fields.push({
        name,
        definition,
        value: section[name] as ComponentPropValue,
        from: "settings",
      });
    } else if (own !== undefined) {
      fields.push({ name, definition, value: own, from: "layer" });
    } else if (definition.default !== undefined) {
      fields.push({ name, definition, value: definition.default, from: "default" });
    } else fields.push({ name, definition, from: "none" });
  }
  const { names, truncated } = undeclaredProps(section, declared);
  return { fields, unknown: names, truncated };
}
