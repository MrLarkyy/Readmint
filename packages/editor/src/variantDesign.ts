import {
  applyRenderVariant,
  DesignLimits,
  type Design,
  type RenderVariant,
} from "@readmint/format";
import { declaredProps } from "./declaredProps.js";
import type { EditorIssue } from "./EditorIssue.js";
import type { EditorState } from "./EditorState.js";

/** Why the design cannot take the variant (a prop of it no top-level component declares); undefined when it can. */
export function variantReason(design: Design, variant: RenderVariant): string | undefined {
  const declared = declaredProps(design);
  for (const name of Object.keys(variant.props)) {
    if (!declared.has(name)) return `no top-level component declares \`${name}\``;
  }
  return undefined;
}

/**
 * The state's design with its variant applied (`applyRenderVariant`, as `readmint render --variant`). Without a
 * variant, or when it does not fit, the design as it is; the issues say why (a message never quotes a value).
 */
export function variantDesign(state: EditorState): {
  design: Design;
  issues: readonly EditorIssue[];
} {
  const variant = state.variant;
  if (variant === undefined) return { design: state.design, issues: [] };
  const result = applyRenderVariant(state.design, variant);
  if (result.ok) return { design: result.value, issues: [] };
  const issues: EditorIssue[] = result.issues.slice(0, DesignLimits.maxIssues).map((issue) => ({
    source: "variant",
    message: `variant ${issue.path === "" ? "/" : issue.path}: ${issue.message}`,
  }));
  if (result.truncated)
    issues.push({ source: "variant", message: "more variant issues not shown" });
  return { design: state.design, issues };
}
