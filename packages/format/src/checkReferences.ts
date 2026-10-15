import type {
  ComponentDefinition,
  ComponentPropDefinition,
  Design,
  FontAsset,
  Layer,
} from "./Design.js";
import type { DesignIssueCode } from "./DesignIssue.js";
import { DesignLimits } from "./DesignLimits.js";
import { designSchemaV0 } from "./designSchemaV0.js";
import { IssueCollector } from "./IssueCollector.js";
import { jsonPointer } from "./jsonPointer.js";
import { quoteInput } from "./quoteInput.js";
import { bindingDef, ref, type SchemaNode } from "./schema/SchemaNode.js";
import { validateNode } from "./schema/validateNode.js";

interface Edge {
  readonly target: string;
  readonly path: string;
}

interface Tree {
  readonly layers: number;
  readonly edges: readonly Edge[];
}

type Records<T> = Readonly<Record<string, T>>;

/**
 * Checks JSON Schema cannot express, on a structurally valid design: references resolve to own
 * entries only (`Object.hasOwn`, so `constructor` is no style), ids are unique per scope
 * (document, each component), component props match their definition, components form no cycle,
 * text has a font, font fallbacks name font assets (each once) and the expanded layer count stays
 * within `maxLayers`. Document order is kept.
 */
export function checkReferences(design: Design, issues: IssueCollector): void {
  new ReferenceWalker(design, issues).run();
}

class ReferenceWalker {
  private readonly styles: Records<{ readonly font?: string }>;
  private readonly fonts: Records<FontAsset>;
  private readonly images: Records<unknown>;
  private readonly components: Records<ComponentDefinition>;
  private readonly cycles = new Map<string, string>();

  constructor(
    private readonly design: Design,
    private readonly issues: IssueCollector,
  ) {
    this.styles = design.styles ?? {};
    this.fonts = design.assets?.fonts ?? {};
    this.images = design.assets?.images ?? {};
    this.components = design.components ?? {};
  }

  run(): void {
    const trees = new Map<string, Tree>();
    for (const name of Object.keys(this.components)) {
      const definition = this.components[name] as ComponentDefinition;
      trees.set(name, collectTree(definition.layers, `/components/${name}/layers`));
    }
    const document = collectTree(this.design.layers, "/layers");
    // Raw counts first: a design too large to expand never reaches the cycle search.
    const tooMany =
      rawLayers(document, trees) > DesignLimits.maxLayers ||
      expandedLayers(document, trees, this.findCycles(trees)) > DesignLimits.maxLayers;
    if (tooMany) {
      this.add(
        "/layers",
        "too-many-layers",
        `the design expands to more than ${String(DesignLimits.maxLayers)} layers`,
      );
      return;
    }

    for (const key of Object.keys(this.design)) {
      if (key === "layers") this.walkLayers(this.design.layers, "/layers", new Map());
      else if (key === "styles") this.checkStyles();
      else if (key === "assets") this.checkFallbacks();
      else if (key === "components") this.checkComponents();
    }
  }

  private checkStyles(): void {
    for (const name of Object.keys(this.styles)) {
      const font = this.styles[name]?.font;
      if (font !== undefined && !Object.hasOwn(this.fonts, font))
        this.add(`/styles/${name}/font`, "unknown-reference", `unknown font ${quoteInput(font)}`);
    }
  }

  private checkFallbacks(): void {
    for (const name of Object.keys(this.fonts)) {
      const seen = new Set<string>();
      (this.fonts[name]?.fallback ?? []).forEach((font, index) => {
        const at = jsonPointer(jsonPointer(jsonPointer("/assets/fonts", name), "fallback"), index);
        if (!Object.hasOwn(this.fonts, font))
          this.add(at, "unknown-reference", `unknown font ${quoteInput(font)}`);
        else if (seen.has(font))
          this.add(at, "duplicate-id", `font ${quoteInput(font)} is already a fallback`);
        seen.add(font);
      });
    }
  }

  private checkComponents(): void {
    for (const name of Object.keys(this.components)) {
      const definition = this.components[name] as ComponentDefinition;
      const path = `/components/${name}`;
      for (const key of Object.keys(definition)) {
        if (key === "props") this.checkDefaults(definition.props ?? {}, `${path}/props`);
        else if (key === "layers") this.walkLayers(definition.layers, `${path}/layers`, new Map());
      }
    }
  }

  private checkDefaults(props: Records<ComponentPropDefinition>, path: string): void {
    for (const name of Object.keys(props)) {
      const definition = props[name] as ComponentPropDefinition;
      if (definition.default === undefined) continue;
      const failure = propFailure(definition, definition.default);
      if (failure === "enum")
        this.add(`${path}/${name}/default`, "enum", enumMessage(definition, definition.default));
      else if (failure)
        this.add(`${path}/${name}/default`, "type", `expected a ${definition.type} default`);
    }
  }

  private walkLayers(layers: readonly Layer[], path: string, ids: Map<string, string>): void {
    layers.forEach((layer, index) => {
      if (this.issues.isFull()) return;
      this.checkLayer(layer, jsonPointer(path, index), ids);
    });
  }

  private checkLayer(layer: Layer, path: string, ids: Map<string, string>): void {
    for (const key of Object.keys(layer)) {
      const at = `${path}/${key}`;
      if (key === "id" && layer.id !== undefined) {
        const first = ids.get(layer.id);
        if (first === undefined) ids.set(layer.id, at);
        else
          this.add(
            at,
            "duplicate-id",
            `layer id ${quoteInput(layer.id)} is already used at ${first}`,
          );
      } else if (key === "style" && layer.style !== undefined) {
        if (!Object.hasOwn(this.styles, layer.style))
          this.add(at, "unknown-reference", `unknown style ${quoteInput(layer.style)}`);
      } else if (key === "font" && layer.type === "text" && layer.font !== undefined) {
        if (!Object.hasOwn(this.fonts, layer.font))
          this.add(at, "unknown-reference", `unknown font ${quoteInput(layer.font)}`);
      } else if (key === "asset" && layer.type === "image") {
        if (!Object.hasOwn(this.images, layer.asset))
          this.add(at, "unknown-reference", `unknown image asset ${quoteInput(layer.asset)}`);
      } else if (key === "ref" && layer.type === "component") {
        if (!Object.hasOwn(this.components, layer.ref))
          this.add(at, "unknown-reference", `unknown component ${quoteInput(layer.ref)}`);
        const cycle = this.cycles.get(at);
        if (cycle !== undefined) this.add(at, "component-cycle", `component cycle ${cycle}`);
      } else if (key === "props" && layer.type === "component") {
        this.checkProps(layer.ref, layer.props ?? {}, at);
      } else if (key === "children" && layer.type === "group") {
        this.walkLayers(layer.children, at, ids);
      }
    }
    if (layer.type === "text") this.checkFont(layer.font, layer.style, path);
    if (layer.type === "component") this.checkRequiredProps(layer.ref, layer.props ?? {}, path);
  }

  private checkFont(font: string | undefined, style: string | undefined, path: string): void {
    if (font !== undefined) return;
    if (style !== undefined) {
      if (!Object.hasOwn(this.styles, style)) return;
      if (this.styles[style]?.font !== undefined) return;
    }
    this.add(`${path}/font`, "missing-font", "text needs a font: set font or a style with a font");
  }

  private checkProps(component: string, props: Records<unknown>, path: string): void {
    if (!Object.hasOwn(this.components, component)) return;
    const declared = this.components[component]?.props ?? {};
    for (const name of Object.keys(props)) {
      const at = `${path}/${name}`;
      if (!Object.hasOwn(declared, name)) {
        this.add(
          at,
          "unknown-property",
          `component ${quoteInput(component)} has no prop ${quoteInput(name)}`,
        );
        continue;
      }
      const definition = declared[name] as ComponentPropDefinition;
      const failure = propFailure(definition, props[name]);
      if (failure === "enum") this.add(at, "enum", enumMessage(definition, props[name]));
      else if (failure) this.add(at, "type", `expected a ${definition.type} or a {{binding}}`);
    }
  }

  private checkRequiredProps(component: string, props: Records<unknown>, path: string): void {
    if (!Object.hasOwn(this.components, component)) return;
    const declared = this.components[component]?.props ?? {};
    for (const name of Object.keys(declared)) {
      if (declared[name]?.required === true && !Object.hasOwn(props, name))
        this.add(`${path}/props/${name}`, "missing-property", `missing required prop "${name}"`);
    }
  }

  /**
   * Iterative DFS; records each cycle at the `ref` that closes it, in time independent of the loop
   * length. Returns the post-order, or undefined when there is a cycle.
   */
  private findCycles(trees: ReadonlyMap<string, Tree>): string[] | undefined {
    const open = new Map<string, number>();
    const done = new Set<string>();
    const finished: string[] = [];
    for (const start of trees.keys()) {
      if (done.has(start)) continue;
      const stack = [{ name: start, next: 0 }];
      open.set(start, 0);
      for (let top = stack.at(-1); top !== undefined; top = stack.at(-1)) {
        const edge = trees.get(top.name)?.edges[top.next++];
        if (edge === undefined) {
          open.delete(top.name);
          done.add(top.name);
          finished.push(top.name);
          stack.pop();
        } else if (trees.has(edge.target) && !done.has(edge.target)) {
          const from = open.get(edge.target);
          if (from === undefined) {
            open.set(edge.target, stack.length);
            stack.push({ name: edge.target, next: 0 });
          } else {
            this.cycles.set(edge.path, describeLoop(stack, from, edge.target));
          }
        }
      }
    }
    return this.cycles.size > 0 ? undefined : finished;
  }

  private add(path: string, code: DesignIssueCode, message: string): void {
    this.issues.add({ path, code, message });
  }
}

/** Layers of the document and every definition, each counted once (saturating). */
function rawLayers(document: Tree, trees: ReadonlyMap<string, Tree>): number {
  let raw = document.layers;
  for (const tree of trees.values()) raw = Math.min(DesignLimits.maxLayers + 1, raw + tree.layers);
  return raw;
}

/** Layers after expanding component instances (saturating); no expansion when there is a cycle. */
function expandedLayers(
  document: Tree,
  trees: ReadonlyMap<string, Tree>,
  order: readonly string[] | undefined,
): number {
  if (order === undefined) return 0;
  const cap = DesignLimits.maxLayers + 1;
  const expanded = new Map<string, number>();
  const size = (tree: Tree): number =>
    tree.edges.reduce(
      (total, edge) => Math.min(cap, total + (expanded.get(edge.target) ?? 0)),
      tree.layers,
    );
  for (const name of order) expanded.set(name, size(trees.get(name) as Tree));
  return size(document);
}

/** `"a" -> "b" -> "a"`; a loop of more than 6 keeps its first 3 and last 2 names around an ellipsis. */
function describeLoop(
  stack: readonly { readonly name: string }[],
  from: number,
  target: string,
): string {
  const quote = (entry: { readonly name: string }): string => JSON.stringify(entry.name);
  const names =
    stack.length - from <= 6
      ? stack.slice(from).map(quote)
      : [...stack.slice(from, from + 3).map(quote), "…", ...stack.slice(-2).map(quote)];
  return [...names, JSON.stringify(target)].join(" -> ");
}

function collectTree(layers: readonly Layer[], path: string): Tree {
  let count = 0;
  const edges: Edge[] = [];
  const visit = (list: readonly Layer[], at: string): void => {
    list.forEach((layer, index) => {
      count++;
      if (layer.type === "component")
        edges.push({ target: layer.ref, path: `${at}/${String(index)}/ref` });
      else if (layer.type === "group") visit(layer.children, `${at}/${String(index)}/children`);
    });
  };
  visit(layers, path);
  return { layers: count, edges };
}

const binding = ref(bindingDef);
const colour = ref("Colour");

const listedValues = 8;

function enumMessage(definition: ComponentPropDefinition, value: unknown): string {
  const values = definition.type === "enum" ? definition.values : [];
  const shown = values
    .slice(0, listedValues)
    .map((item) => quoteInput(item))
    .join(", ");
  return `expected one of ${shown}${values.length > listedValues ? ", ..." : ""}, got ${quoteInput(String(value))}`;
}

function propFailure(
  definition: ComponentPropDefinition,
  value: unknown,
): "type" | "enum" | undefined {
  if (typeof value === "string" && matches(binding, value)) return undefined;
  switch (definition.type) {
    case "string":
      return typeof value === "string" ? undefined : "type";
    case "number":
      return typeof value === "number" ? undefined : "type";
    case "boolean":
      return typeof value === "boolean" ? undefined : "type";
    case "color":
      return typeof value === "string" && matches(colour, value) ? undefined : "type";
    case "enum":
      if (typeof value !== "string") return "type";
      return definition.values.includes(value) ? undefined : "enum";
    case "array":
      return Array.isArray(value) ? undefined : "type";
  }
}

function matches(node: SchemaNode, value: unknown): boolean {
  const scratch = new IssueCollector();
  validateNode(designSchemaV0, node, value, "", scratch);
  return scratch.isEmpty;
}
