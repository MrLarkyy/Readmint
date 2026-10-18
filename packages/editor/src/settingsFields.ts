import type { ComponentPropDefinition, ComponentPropValue } from "@readmint/format";
import { declaredProps, layerValue, undeclaredProps } from "./declaredProps.js";
import type { EditorState } from "./EditorState.js";
import { renderEntryDesign } from "./renderEntryDesign.js";
import { chosenRender } from "./rendersOfFile.js";
import { variantDesign } from "./variantDesign.js";

/** One prop the design declares, as the settings form shows it. */
export interface SettingsField {
  readonly name: string;
  readonly definition: ComponentPropDefinition;
  /** What renders: the section's value, else the applied variant's, else the chosen render's, else the layer's own, else the definition's default; none when in none. */
  readonly value?: ComponentPropValue;
  /** Where `value` comes from: the section, the chosen variant (which sits under the section), the chosen manifest render's props, the top-level component layer's own props, the definition's default, or nowhere. */
  readonly from: "settings" | "variant" | "render" | "layer" | "default" | "none";
}

/**
 * The fields of the form for the chosen section: every prop a top-level component of the design declares (declaration
 * order, each once), and the section's props nothing declares (`unknown`, at most `DesignLimits.maxIssues`, with
 * `truncated` when there are more). The chosen variant's value counts only when the variant applies to the design.
 * No section chosen: nothing.
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
  const entered = renderEntryDesign(state, state.design);
  const variant =
    !entered.variantClash && variantDesign(state, entered.design).issues.length === 0
      ? state.variant
      : undefined;
  const render = entered.propsApplied ? chosenRender(state.manifest)?.entry.props : undefined;
  const fields: SettingsField[] = [];
  for (const [name, definition] of declared) {
    const own = layerValue(state.design, name);
    const variantValue =
      variant !== undefined && Object.hasOwn(variant.props, name) ? variant.props[name] : undefined;
    if (Object.hasOwn(section, name)) {
      fields.push({
        name,
        definition,
        value: section[name] as ComponentPropValue,
        from: "settings",
      });
    } else if (variantValue !== undefined) {
      fields.push({ name, definition, value: variantValue, from: "variant" });
    } else if (render !== undefined && Object.hasOwn(render, name)) {
      fields.push({ name, definition, value: render[name] as ComponentPropValue, from: "render" });
    } else if (own !== undefined) {
      fields.push({ name, definition, value: own, from: "layer" });
    } else if (definition.default !== undefined) {
      fields.push({ name, definition, value: definition.default, from: "default" });
    } else fields.push({ name, definition, from: "none" });
  }
  const { names, truncated } = undeclaredProps(section, declared);
  return { fields, unknown: names, truncated };
}
