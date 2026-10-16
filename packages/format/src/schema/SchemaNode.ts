/**
 * A small schema language with two interpreters: `validateNode` (issues with JSON Pointer paths)
 * and `toJsonSchema` (the published JSON Schema 2020-12). One definition drives both, so the
 * runtime validator and the published file cannot drift.
 */
export type SchemaNode =
  | StringNode
  | NumberNode
  | BooleanNode
  | LiteralNode
  | ObjectNode
  | ArrayNode
  | RecordNode
  | UnionNode
  | ChoiceNode
  | RefNode;

export interface StringNode {
  readonly kind: "string";
  readonly label: string;
  readonly minLength: number;
  /** Counted in code points, as JSON Schema does. */
  readonly maxLength: number;
  /** Regular expression source, compiled with the `u` flag (the JSON Schema dialect). */
  readonly pattern?: string;
  readonly enum?: readonly string[];
}

export interface NumberNode {
  readonly kind: "number";
  readonly label: string;
  readonly integer: boolean;
  readonly minimum?: number;
  readonly exclusiveMinimum?: number;
  readonly maximum?: number;
}

export interface BooleanNode {
  readonly kind: "boolean";
  readonly label: string;
}

export interface LiteralNode {
  readonly kind: "literal";
  readonly label: string;
  readonly value: string | number;
}

export interface PropertyNode {
  readonly node: SchemaNode;
  readonly required: boolean;
}

export interface ObjectNode {
  readonly kind: "object";
  readonly label: string;
  readonly properties: ReadonlyMap<string, PropertyNode>;
}

export interface ArrayNode {
  readonly kind: "array";
  readonly label: string;
  readonly items: SchemaNode;
  readonly minItems: number;
  readonly maxItems?: number;
}

/** An object whose keys follow `keys` and whose values all follow `values`. */
export interface RecordNode {
  readonly kind: "record";
  readonly label: string;
  readonly keys: StringNode;
  readonly values: SchemaNode;
  readonly maxEntries?: number;
}

/** Objects told apart by their `type` property; only the named variant is validated. */
export interface UnionNode {
  readonly kind: "union";
  readonly label: string;
  readonly variants: ReadonlyMap<string, ObjectNode>;
}

/** Any one of the options (e.g. a literal or a binding). */
export interface ChoiceNode {
  readonly kind: "choice";
  readonly options: readonly SchemaNode[];
}

export interface RefNode {
  readonly kind: "ref";
  readonly name: string;
}

export interface SchemaDocument {
  readonly root: ObjectNode;
  /** Named nodes, referenced by `ref`; emitted as `$defs`. */
  readonly defs: ReadonlyMap<string, SchemaNode>;
}

export const discriminant = "type";

/** Name of the `$defs` entry holding the `{{...}}` binding string. */
export const bindingDef = "Binding";

type Optional<T> = { readonly [K in keyof T]?: T[K] };

export function string(
  label: string,
  options: { maxLength: number } & Optional<Pick<StringNode, "minLength" | "pattern">>,
): StringNode {
  return {
    kind: "string",
    label,
    minLength: options.minLength ?? 0,
    maxLength: options.maxLength,
    ...(options.pattern === undefined ? {} : { pattern: options.pattern }),
  };
}

export function enumOf(values: readonly string[]): StringNode {
  const longest = Math.max(...values.map((value) => value.length));
  return {
    kind: "string",
    label: `one of ${values.map((value) => JSON.stringify(value)).join(", ")}`,
    minLength: 0,
    maxLength: longest,
    enum: values,
  };
}

export function number(
  options: Optional<Pick<NumberNode, "minimum" | "exclusiveMinimum" | "maximum">>,
): NumberNode {
  return { kind: "number", label: "a number", integer: false, ...options };
}

export function integer(options: Optional<Pick<NumberNode, "minimum" | "maximum">>): NumberNode {
  return { kind: "number", label: "an integer", integer: true, ...options };
}

export function boolean(): BooleanNode {
  return { kind: "boolean", label: "true or false" };
}

export function literal(value: string | number): LiteralNode {
  return { kind: "literal", label: JSON.stringify(value), value };
}

/** Property `name?` is optional, `name` required; order is kept for messages and the schema. */
export function object(label: string, properties: Record<string, SchemaNode>): ObjectNode {
  const map = new Map<string, PropertyNode>();
  for (const [key, node] of Object.entries(properties)) {
    const optional = key.endsWith("?");
    map.set(optional ? key.slice(0, -1) : key, { node, required: !optional });
  }
  return { kind: "object", label, properties: map };
}

export function array(
  label: string,
  items: SchemaNode,
  options: Optional<Pick<ArrayNode, "minItems" | "maxItems">> = {},
): ArrayNode {
  return {
    kind: "array",
    label,
    items,
    minItems: options.minItems ?? 0,
    ...(options.maxItems === undefined ? {} : { maxItems: options.maxItems }),
  };
}

export function record(
  label: string,
  keys: StringNode,
  values: SchemaNode,
  options: Optional<Pick<RecordNode, "maxEntries">> = {},
): RecordNode {
  return {
    kind: "record",
    label,
    keys,
    values,
    ...(options.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
  };
}

/** Each variant must declare `type: literal(<tag>)` as its first property. */
export function union(label: string, variants: readonly ObjectNode[]): UnionNode {
  const map = new Map<string, ObjectNode>();
  for (const variant of variants) {
    const tag = variant.properties.get(discriminant)?.node;
    if (tag?.kind !== "literal" || typeof tag.value !== "string")
      throw new Error(`union ${label}: variant ${variant.label} has no string type literal`);
    map.set(tag.value, variant);
  }
  return { kind: "union", label, variants: map };
}

export function choice(...options: SchemaNode[]): ChoiceNode {
  return { kind: "choice", options };
}

export function ref(name: string): RefNode {
  return { kind: "ref", name };
}

/** The literal node or a `{{...}}` binding evaluated later (RM-12). */
export function bindable(node: SchemaNode): ChoiceNode {
  return choice(node, ref(bindingDef));
}
