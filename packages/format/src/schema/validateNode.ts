import type { DesignIssueCode } from "../DesignIssue.js";
import { IssueCollector } from "../IssueCollector.js";
import { isPlainObject } from "../isPlainObject.js";
import { jsonPointer } from "../jsonPointer.js";
import { quoteInput } from "../quoteInput.js";
import {
  bindingDef,
  discriminant,
  type ArrayNode,
  type ChoiceNode,
  type NumberNode,
  type ObjectNode,
  type RecordNode,
  type SchemaDocument,
  type SchemaNode,
  type StringNode,
  type UnionNode,
} from "./SchemaNode.js";

type ValueKind = "string" | "number" | "boolean" | "object" | "array" | "other";

const patterns = new Map<string, RegExp>();

/**
 * Walks `value` against `node`, adding issues in document order (own keys in insertion order).
 * The caller bounds nesting depth and value count beforehand, so the recursion is bounded too.
 */
export function validateNode(
  schema: SchemaDocument,
  node: SchemaNode,
  value: unknown,
  path: string,
  issues: IssueCollector,
): void {
  new Walker(schema, issues).visit(node, value, path);
}

class Walker {
  constructor(
    private readonly schema: SchemaDocument,
    private readonly issues: IssueCollector,
  ) {}

  visit(node: SchemaNode, value: unknown, path: string): void {
    if (this.issues.isFull()) return;
    const target = this.resolve(node);
    switch (target.kind) {
      case "string":
        if (typeof value === "string") this.checkString(target, value, path);
        else this.expected(target, path);
        break;
      case "number":
        this.checkNumber(target, value, path);
        break;
      case "boolean":
        if (typeof value !== "boolean") this.expected(target, path);
        break;
      case "literal":
        if (value !== target.value) this.add(path, "enum", `expected ${target.label}`);
        break;
      case "object":
        if (isPlainObject(value)) this.checkObject(target, value, path);
        else this.expected(target, path);
        break;
      case "array":
        if (Array.isArray(value)) this.checkArray(target, value, path);
        else this.expected(target, path);
        break;
      case "record":
        if (isPlainObject(value)) this.checkRecord(target, value, path);
        else this.expected(target, path);
        break;
      case "union":
        if (isPlainObject(value)) this.checkUnion(target, value, path);
        else this.expected(target, path);
        break;
      case "choice":
        this.checkChoice(target, value, path);
        break;
    }
  }

  private checkString(node: StringNode, value: string, path: string): void {
    const failure = stringFailure(node, value);
    if (failure === "enum")
      this.add(path, "enum", `expected ${node.label}, got ${quoteInput(value)}`);
    else if (failure === "short")
      this.add(
        path,
        "length",
        node.minLength === 1
          ? "must not be empty"
          : `must be at least ${String(node.minLength)} characters`,
      );
    else if (failure === "long")
      this.add(path, "length", `must be at most ${String(node.maxLength)} characters`);
    else if (failure === "pattern")
      this.add(path, "pattern", `${quoteInput(value)} is not ${node.label}`);
  }

  private checkNumber(node: NumberNode, value: unknown, path: string): void {
    if (typeof value !== "number") this.expected(node, path);
    else if (!Number.isFinite(value)) this.add(path, "type", "expected a finite number");
    else if (node.integer && !Number.isInteger(value))
      this.add(path, "type", "expected an integer");
    else if (
      (node.minimum !== undefined && value < node.minimum) ||
      (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) ||
      (node.maximum !== undefined && value > node.maximum)
    )
      this.add(path, "range", describeRange(node));
  }

  private checkArray(node: ArrayNode, value: readonly unknown[], path: string): void {
    if (value.length < node.minItems)
      this.add(path, "count", `must have at least ${String(node.minItems)} items`);
    else if (node.maxItems !== undefined && value.length > node.maxItems)
      this.add(path, "count", `must have at most ${String(node.maxItems)} items`);
    value.forEach((item, index) => {
      this.visit(node.items, item, jsonPointer(path, index));
    });
  }

  private checkRecord(node: RecordNode, value: Record<string, unknown>, path: string): void {
    const keys = Object.keys(value);
    if (node.minEntries !== undefined && keys.length < node.minEntries)
      this.add(
        path,
        "count",
        node.minEntries === 1
          ? "must have at least 1 entry"
          : `must have at least ${String(node.minEntries)} entries`,
      );
    else if (node.maxEntries !== undefined && keys.length > node.maxEntries)
      this.add(path, "count", `must have at most ${String(node.maxEntries)} entries`);
    for (const key of keys) {
      if (this.issues.isFull()) return;
      const keyPath = jsonPointer(path, key);
      if (stringFailure(node.keys, key) === undefined) this.visit(node.values, value[key], keyPath);
      else
        this.add(keyPath, "pattern", `property name ${quoteInput(key)} is not ${node.keys.label}`);
    }
  }

  private checkObject(node: ObjectNode, value: Record<string, unknown>, path: string): void {
    for (const key of Object.keys(value)) {
      if (this.issues.isFull()) return;
      const property = node.properties.get(key);
      if (property === undefined)
        this.add(jsonPointer(path, key), "unknown-property", `unknown property ${quoteInput(key)}`);
      else this.visit(property.node, value[key], jsonPointer(path, key));
    }
    for (const [key, property] of node.properties) {
      if (property.required && !Object.hasOwn(value, key))
        this.add(jsonPointer(path, key), "missing-property", `missing required property "${key}"`);
    }
  }

  private checkUnion(node: UnionNode, value: Record<string, unknown>, path: string): void {
    const tagPath = jsonPointer(path, discriminant);
    const tag = value[discriminant];
    const variant = typeof tag === "string" ? node.variants.get(tag) : undefined;
    if (!Object.hasOwn(value, discriminant))
      this.add(tagPath, "missing-property", `missing required property "${discriminant}"`);
    else if (variant === undefined) {
      const allowed = [...node.variants.keys()].map((key) => JSON.stringify(key)).join(", ");
      const got = typeof tag === "string" ? quoteInput(tag) : kindOf(tag);
      this.add(tagPath, "enum", `expected one of ${allowed}, got ${got}`);
    } else this.checkObject(variant, value, path);
  }

  /** Reports the option matching the value's kind, so a bad opacity says "range", not "type". */
  private checkChoice(node: ChoiceNode, value: unknown, path: string): void {
    const kind = kindOf(value);
    const candidates = node.options.filter((option) => this.accepts(option, kind));
    const [only] = candidates;
    if (candidates.length === 1 && only !== undefined && !isBinding(only)) {
      this.visit(only, value, path);
      return;
    }
    if (candidates.some((option) => this.passes(option, value))) return;
    const label = this.label(node);
    const binding = candidates.find(isBinding);
    const strings = candidates.filter((option) => !isBinding(option)).map((o) => this.resolve(o));
    const longest = Math.max(
      ...strings.map((option) => (option.kind === "string" ? option.maxLength : Infinity)),
    );
    const shortest = Math.min(
      ...strings.map((option) => (option.kind === "string" ? option.minLength : 0)),
    );
    // The string form whose shape the value has reports what it breaks (a template `d` that is too long says length).
    const shaped =
      typeof value === "string"
        ? strings.find(
            (option) =>
              option.kind === "string" &&
              option.pattern !== undefined &&
              compile(option.pattern).test(value),
          )
        : undefined;
    if (binding !== undefined && typeof value === "string" && value.startsWith("{{"))
      this.visit(binding, value, path);
    else if (typeof value !== "string" || strings.length === 0)
      this.add(path, "type", `expected ${label}`);
    else if (shaped !== undefined) this.visit(shaped, value, path);
    else if (codePoints(value, shortest) < shortest)
      this.add(
        path,
        "length",
        shortest === 1 ? "must not be empty" : `must be at least ${String(shortest)} characters`,
      );
    else if (codePoints(value, longest + 1) > longest)
      this.add(path, "length", `must be at most ${String(longest)} characters`);
    else this.add(path, "pattern", `${quoteInput(value)} is not ${label}`);
  }

  private passes(node: SchemaNode, value: unknown): boolean {
    const scratch = new IssueCollector();
    new Walker(this.schema, scratch).visit(node, value, "");
    return scratch.isEmpty;
  }

  private accepts(node: SchemaNode, kind: ValueKind): boolean {
    const target = this.resolve(node);
    switch (target.kind) {
      case "string":
      case "number":
      case "boolean":
        return target.kind === kind;
      case "literal":
        return kindOf(target.value) === kind;
      case "object":
      case "record":
      case "union":
        return kind === "object";
      case "array":
        return kind === "array";
      case "choice":
        return target.options.some((option) => this.accepts(option, kind));
    }
  }

  private label(node: SchemaNode): string {
    const target = this.resolve(node);
    if (target.kind !== "choice") return target.label;
    const labels = target.options.map((option) => this.label(option));
    const last = labels.pop() ?? "";
    return labels.length === 0 ? last : `${labels.join(", ")} or ${last}`;
  }

  private resolve(node: SchemaNode): Exclude<SchemaNode, { kind: "ref" }> {
    let current = node;
    while (current.kind === "ref") {
      const next = this.schema.defs.get(current.name);
      if (next === undefined) throw new Error(`schema has no definition ${current.name}`);
      current = next;
    }
    return current;
  }

  private expected(node: SchemaNode, path: string): void {
    this.add(path, "type", `expected ${this.label(node)}`);
  }

  private add(path: string, code: DesignIssueCode, message: string): void {
    this.issues.add({ path, code, message });
  }
}

function isBinding(node: SchemaNode): boolean {
  return node.kind === "ref" && node.name === bindingDef;
}

function kindOf(value: unknown): ValueKind {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return typeof value as ValueKind;
  if (Array.isArray(value)) return "array";
  return isPlainObject(value) ? "object" : "other";
}

/** First failed constraint of a string, checking length before any pattern runs. */
function stringFailure(
  node: StringNode,
  value: string,
): "enum" | "short" | "long" | "pattern" | undefined {
  if (node.enum !== undefined) return node.enum.includes(value) ? undefined : "enum";
  if (value.length < node.minLength || codePoints(value, node.minLength) < node.minLength)
    return "short";
  if (value.length > node.maxLength && codePoints(value, node.maxLength + 1) > node.maxLength)
    return "long";
  if (node.pattern !== undefined && !compile(node.pattern).test(value)) return "pattern";
  return undefined;
}

/** Code points of `value`, counting stops once `stopAfter` is reached. */
function codePoints(value: string, stopAfter: number): number {
  let count = 0;
  for (let index = 0; index < value.length && count < stopAfter; index++) {
    const unit = value.charCodeAt(index);
    if (unit < 0xdc00 || unit > 0xdfff || index === 0) count++;
    else {
      const previous = value.charCodeAt(index - 1);
      if (previous < 0xd800 || previous > 0xdbff) count++;
    }
  }
  return count;
}

function compile(pattern: string): RegExp {
  let compiled = patterns.get(pattern);
  if (compiled === undefined) {
    compiled = new RegExp(pattern, "u");
    patterns.set(pattern, compiled);
  }
  return compiled;
}

function describeRange(node: NumberNode): string {
  const low =
    node.exclusiveMinimum !== undefined
      ? `greater than ${String(node.exclusiveMinimum)}`
      : node.minimum !== undefined
        ? `at least ${String(node.minimum)}`
        : undefined;
  const high = node.maximum !== undefined ? `at most ${String(node.maximum)}` : undefined;
  if (node.minimum !== undefined && high !== undefined)
    return `must be between ${String(node.minimum)} and ${String(node.maximum)}`;
  return `must be ${[low, high].filter((part) => part !== undefined).join(" and ")}`;
}
