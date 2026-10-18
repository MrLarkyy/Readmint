import { applyDesignProps, DesignLimits, type Design } from "@readmint/format";
import type { EditorIssue } from "./EditorIssue.js";
import type { EditorState } from "./EditorState.js";
import { chosenRender } from "./rendersOfFile.js";

/** The design with the chosen render's props, why they or the variant do not apply, and whether the run's variant must be left out. */
export interface RenderEntryDesign {
  readonly design: Design;
  readonly issues: readonly EditorIssue[];
  /** The chosen variant clashes with a prop of a render that lists no variants: the CLI refuses it, the preview leaves it out. */
  readonly variantClash: boolean;
  /** The render has no props or they applied; false when they were left out. */
  readonly propsApplied: boolean;
}

/**
 * The chosen render's props set on the design (`applyDesignProps`, unfiltered, as the CLI's manifest render does
 * before the variant and the section). No render, or no props: the design as it is. A message names pointers, never a value.
 */
export function renderEntryDesign(state: EditorState, design: Design): RenderEntryDesign {
  const chosen = chosenRender(state.manifest);
  if (chosen === undefined) return { design, issues: [], variantClash: false, propsApplied: true };
  const { entry, index } = chosen;
  const at = `/renders/${String(index)}`;
  const issues: EditorIssue[] = [];
  const variant = state.variant;
  // The parse-time rule for the variants a render lists, applied to the run's variant when it lists none.
  const clashes =
    entry.variants === undefined && variant !== undefined
      ? Object.keys(variant.props).filter((name) => Object.hasOwn(entry.props, name))
      : [];
  for (const name of clashes.slice(0, DesignLimits.maxIssues)) {
    issues.push({
      source: "manifest",
      message: `manifest ${at}/props/${name}: the prop ${name} is also set by the ${variant?.name ?? ""} variant; set it in one place`,
      path: `${at}/props/${name}`,
    });
  }
  const variantClash = clashes.length > 0;
  if (Object.keys(entry.props).length === 0) {
    return { design, issues, variantClash, propsApplied: true };
  }
  const result = applyDesignProps(design, entry.props);
  if (result.ok) return { design: result.value, issues, variantClash, propsApplied: true };
  for (const issue of result.issues.slice(0, DesignLimits.maxIssues)) {
    issues.push({
      source: "manifest",
      message: `render ${JSON.stringify(entry.name)} ${at}/props${issue.path}: ${issue.message}`,
      path: `${at}/props${issue.path}`,
    });
  }
  if (result.truncated)
    issues.push({ source: "manifest", message: "more manifest issues not shown" });
  return { design, issues, variantClash, propsApplied: false };
}
