import type { ComponentLayer, ComponentPropValue, Design, Layer } from "./Design.js";
import type { DesignIssue, DesignIssueCode } from "./DesignIssue.js";
import type { DesignResult } from "./DesignResult.js";
import { jsonPointer } from "./jsonPointer.js";
import { quoteInput } from "./quoteInput.js";
import { validateDesign } from "./validateDesign.js";

const noValue: Partial<Record<DesignIssueCode, string>> = {
  enum: "the value is not one of the prop's allowed values",
  type: "the value has the wrong type for the prop",
};

/**
 * Sets `props` on every top-level component layer of `design` whose component declares the prop; the settings value
 * wins over the layer's literal. The result is validated again. Issue paths are relative to the settings section
 * (`/<prop>`), and a message never quotes a value. The input is not changed; empty `props` return `design` itself.
 */
export function applyDesignProps(
  design: Design,
  props: Readonly<Record<string, ComponentPropValue>>,
): DesignResult<Design> {
  const names = Object.keys(props);
  if (names.length === 0) return { ok: true, value: design };
  const taken = new Set<string>();
  const written = new Map<string, string>();
  let any = false;
  const layers = design.layers.map((layer, index): Layer => {
    if (layer.type !== "component") return layer;
    any = true;
    const declared = design.components?.[layer.ref]?.props ?? {};
    const own = names.filter((name) => Object.hasOwn(declared, name));
    if (own.length === 0) return layer;
    const merged: Record<string, ComponentPropValue> = { ...layer.props };
    for (const name of own) {
      merged[name] = props[name] as ComponentPropValue;
      taken.add(name);
      written.set(`/layers/${String(index)}/props/${name}`, name);
    }
    return { ...layer, props: merged } satisfies ComponentLayer;
  });
  if (!any) {
    return fail([
      {
        path: "",
        code: "unknown-property",
        message: "the design has no top-level component layer",
      },
    ]);
  }
  const unknown = names.filter((name) => !taken.has(name));
  if (unknown.length > 0) {
    return fail(
      unknown.map((name) => ({
        path: jsonPointer("", name),
        code: "unknown-property",
        message: `no top-level component of the design has the prop ${quoteInput(name)}`,
      })),
    );
  }
  const result = validateDesign({ ...design, layers });
  if (result.ok) return result;
  return {
    ok: false,
    truncated: result.truncated,
    issues: result.issues.map((issue) => relocate(issue, written)),
  };
}

function relocate(issue: DesignIssue, written: ReadonlyMap<string, string>): DesignIssue {
  for (const [pointer, name] of written) {
    if (issue.path === pointer || issue.path.startsWith(`${pointer}/`)) {
      return {
        path: jsonPointer("", name),
        code: issue.code,
        message: noValue[issue.code] ?? "the value is not valid for the prop",
      };
    }
  }
  return issue;
}

function fail(issues: readonly DesignIssue[]): DesignResult<Design> {
  return { ok: false, issues, truncated: false };
}
