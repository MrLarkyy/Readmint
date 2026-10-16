import type { ComponentLayer, ComponentPropDefinition } from "@readmint/format";
import type { Scope } from "@readmint/expr";
import { evaluateBinding } from "./expressions.js";
import { ownEntry } from "./ownEntry.js";
import { parseColour } from "./parseColour.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { echo, isBinding } from "./resolveValue.js";

/** Defaults overlaid by the instance's props, bindings evaluated in the instance's scope, types checked. */
export function resolveProps(
  context: RenderContext,
  layer: ComponentLayer,
  definitions: Readonly<Record<string, ComponentPropDefinition>>,
  path: string,
  scope: Scope,
): Readonly<Record<string, unknown>> {
  const props = Object.create(null) as Record<string, unknown>;
  for (const name of Object.keys(definitions)) {
    const definition = ownEntry(definitions, name);
    if (definition === undefined) continue;
    const given = ownEntry(layer.props, name);
    if (given === undefined) {
      if (definition.default !== undefined) props[name] = definition.default;
      continue;
    }
    const propPath = pointer(pointer(path, "props"), name);
    const value = isBinding(given) ? evaluateBinding(context, given, propPath, scope) : given;
    if (!matchesPropType(definition, value)) {
      context.fail(
        propPath,
        "type",
        `prop ${echo(name)} expects ${expectation(definition)}, got ${echo(value)}`,
      );
    }
    props[name] = value;
  }
  return props;
}

const listedValues = 8;

function expectation(definition: ComponentPropDefinition): string {
  switch (definition.type) {
    case "array":
      return "an array";
    case "enum": {
      const values = Array.isArray(definition.values)
        ? (definition.values as readonly string[])
        : [];
      const shown = values
        .slice(0, listedValues)
        .map((item) => echo(item))
        .join(", ");
      return `one of ${shown}${values.length > listedValues ? ", ..." : ""}`;
    }
    default:
      return `a ${definition.type}`;
  }
}

function matchesPropType(definition: ComponentPropDefinition, value: unknown): boolean {
  switch (definition.type) {
    case "array":
      return Array.isArray(value);
    case "enum":
      return (
        typeof value === "string" &&
        Array.isArray(definition.values) &&
        (definition.values as readonly unknown[]).includes(value)
      );
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "color":
      return typeof value === "string" && parseColour(value) !== undefined;
  }
}
