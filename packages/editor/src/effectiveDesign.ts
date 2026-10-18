import {
  applyDesignProps,
  DesignLimits,
  type ComponentPropValue,
  type Design,
} from "@readmint/format";
import { declaredProps, layerValue, undeclaredProps } from "./declaredProps.js";
import type { EditorIssue } from "./EditorIssue.js";
import type { EditorState } from "./EditorState.js";
import { renderEntryDesign } from "./renderEntryDesign.js";
import { chosenRender } from "./rendersOfFile.js";
import { variantDesign } from "./variantDesign.js";

/** The design a render shows, why the chosen variant or settings section could not be applied, and what it only warns about. */
export interface EffectiveDesign {
  readonly design: Design;
  /** Why the variant or the section does not apply; the part that does not apply is left out and the other still applies. */
  readonly issues: readonly EditorIssue[];
  /** Props the section lacks or that nothing declares; the preview is not blocked. */
  readonly warnings: readonly EditorIssue[];
  /** Props of the section that no top-level component declares (at most `DesignLimits.maxIssues`). The CLI refuses them. */
  readonly unknownProps: readonly string[];
}

/**
 * The design the preview and the raster export render, in the order of `readmint render --manifest`: the chosen
 * render's props (`applyDesignProps`, unfiltered), then the variant (`applyRenderVariant`, as `--variant`), then the chosen settings
 * section (`applyDesignProps`, as `--props`; a section prop wins over the render's and the variant's, with a warning),
 * but only the props the design declares: a prop it does not
 * declare is a warning and `unknownProps`, a declared prop the section lacks a warning too. When a part does not
 * apply, it is left out, the others still apply, and the reasons are given (a message never quotes a value).
 */
export function effectiveDesign(state: EditorState): EffectiveDesign {
  const entered = renderEntryDesign(state, state.design);
  const varied = entered.variantClash
    ? { design: entered.design, issues: [] }
    : variantDesign(state, entered.design);
  const applied = varied.issues.length === 0 && !entered.variantClash;
  const result = withSection(state, varied.design, applied);
  const before = [...entered.issues, ...varied.issues];
  return before.length === 0 ? result : { ...result, issues: [...before, ...result.issues] };
}

function withSection(state: EditorState, base: Design, variantApplied: boolean): EffectiveDesign {
  const settings = state.settings;
  const section = settings?.section;
  if (settings === undefined || section === undefined) return plain(base);
  const props = settings.sections[section];
  if (props === undefined) return plain(base);
  const overridden: string[] =
    variantApplied && state.variant !== undefined
      ? Object.keys(state.variant.props)
          .filter((name) => Object.hasOwn(props, name))
          .map(
            (name) =>
              `settings /${section}/${name}: the section sets it, which overrides the ${state.variant?.name ?? ""} variant`,
          )
      : [];
  const render = chosenRender(state.manifest)?.entry;
  const overriddenRender =
    render === undefined
      ? []
      : Object.keys(render.props)
          .filter((name) => Object.hasOwn(props, name))
          .map(
            (name) =>
              `settings /${section}/${name}: the section sets it, which overrides the props of render ${JSON.stringify(render.name)}`,
          );
  overridden.unshift(...overriddenRender);
  if (!base.layers.some((layer) => layer.type === "component")) {
    return fromResult(base, section, applyDesignProps(base, props), overridden, []);
  }
  const declared = declaredProps(base);
  const applied: Record<string, ComponentPropValue> = {};
  const warnings: string[] = [];
  for (const name of declared.keys()) {
    if (Object.hasOwn(props, name)) applied[name] = props[name] as ComponentPropValue;
    else if (declared.get(name)?.default === undefined && layerValue(base, name) === undefined)
      warnings.push(
        `settings /${section}/${name}: not set in the section, by a layer or by a default; nothing is rendered for it`,
      );
  }
  const unknown = undeclaredProps(props, declared);
  warnings.unshift(...overridden);
  const unknownWarnings = unknown.names.map(
    (name) =>
      `settings /${section}/${name}: no top-level component of the design has this prop; the CLI refuses the section until it is removed`,
  );
  return fromResult(
    base,
    section,
    applyDesignProps(base, applied),
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
