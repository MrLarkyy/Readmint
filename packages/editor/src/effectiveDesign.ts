import {
  applyDesignProps,
  DesignLimits,
  type ComponentPropValue,
  type Design,
} from "@readmint/format";
import { declaredProps, layerValue, undeclaredProps } from "./declaredProps.js";
import type { EditorIssue } from "./EditorIssue.js";
import type { EditorState } from "./EditorState.js";

/** The design a render shows, why the chosen settings section could not be applied, and what it only warns about. */
export interface EffectiveDesign {
  readonly design: Design;
  /** Why the section does not apply; the design is then rendered as it is. */
  readonly issues: readonly EditorIssue[];
  /** Props the section lacks or that nothing declares; the preview is not blocked. */
  readonly warnings: readonly EditorIssue[];
  /** Props of the section that no top-level component declares (at most `DesignLimits.maxIssues`). The CLI refuses them. */
  readonly unknownProps: readonly string[];
}

/**
 * The design the preview and the raster export render: the state's design with the chosen settings section applied
 * (`applyDesignProps`, as `readmint render --props`), but only the props the design declares: a prop it does not
 * declare is a warning and `unknownProps`, a declared prop the section lacks a warning too. When the section does not
 * apply, the design as it is and the reasons (a message never quotes a value).
 */
export function effectiveDesign(state: EditorState): EffectiveDesign {
  const settings = state.settings;
  const section = settings?.section;
  if (settings === undefined || section === undefined) return plain(state.design);
  const props = settings.sections[section];
  if (props === undefined) return plain(state.design);
  if (!state.design.layers.some((layer) => layer.type === "component")) {
    return fromResult(state.design, section, applyDesignProps(state.design, props), [], []);
  }
  const declared = declaredProps(state.design);
  const applied: Record<string, ComponentPropValue> = {};
  const warnings: string[] = [];
  for (const name of declared.keys()) {
    if (Object.hasOwn(props, name)) applied[name] = props[name] as ComponentPropValue;
    else if (
      declared.get(name)?.default === undefined &&
      layerValue(state.design, name) === undefined
    )
      warnings.push(
        `settings /${section}/${name}: not set in the section; the design's value is used`,
      );
  }
  const unknown = undeclaredProps(props, declared);
  const unknownWarnings = unknown.names.map(
    (name) =>
      `settings /${section}/${name}: no top-level component of the design has this prop; the CLI refuses the section until it is removed`,
  );
  return fromResult(
    state.design,
    section,
    applyDesignProps(state.design, applied),
    [...unknownWarnings, ...warnings],
    unknown.names,
    unknown.truncated,
  );
}

function plain(design: Design): EffectiveDesign {
  return { design, issues: [], warnings: [], unknownProps: [] };
}

function fromResult(
  design: Design,
  section: string,
  result: ReturnType<typeof applyDesignProps>,
  warningTexts: readonly string[],
  unknownProps: readonly string[],
  moreUnknown = false,
): EffectiveDesign {
  const warnings: EditorIssue[] = warningTexts
    .slice(0, DesignLimits.maxIssues)
    .map((message) => ({ source: "settings", message, severity: "warning" }));
  if (warningTexts.length > DesignLimits.maxIssues || moreUnknown) {
    warnings.push({
      source: "settings",
      message: "more settings warnings not shown",
      severity: "warning",
    });
  }
  if (result.ok) return { design: result.value, issues: [], warnings, unknownProps };
  const issues: EditorIssue[] = result.issues.map((issue) => ({
    source: "settings",
    message: `settings /${section}${issue.path}: ${issue.message}`,
  }));
  if (result.truncated)
    issues.push({ source: "settings", message: "more settings issues not shown" });
  return { design, issues, warnings, unknownProps };
}
