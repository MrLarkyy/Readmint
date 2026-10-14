import type { ComponentDefinition, ComponentPropDefinition, Design, Layer } from "./Design.js";
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
 * text has a font and the expanded layer count stays within `maxLayers`. Document order is kept.
 */
export function checkReferences(design: Design, issues: IssueCollector): void {
  new ReferenceWalker(design, issues).run();
}

class ReferenceWalker {
  private readonly styles: Records<{ readonly font?: string }>;
  private readonly fonts: Records<unknown>;
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
    const finished = this.findCycles(trees);
    const layerCount = this.countLayers(
      collectTree(this.design.layers, "/layers"),
      trees,
      finished,
    );
    if (layerCount > DesignLimits.maxLayers) {
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
      if (definition.default !== undefined && !fitsProp(definition, definition.default))
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
      if (!fitsProp(definition, props[name]))
        this.add(at, "type", `expected a ${definition.type} or a {{binding}}`);
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

  /** Iterative DFS; records each cycle at the `ref` that closes it. Returns post-order. */
  private findCycles(trees: ReadonlyMap<string, Tree>): string[] {
    const state = new Map<string, "open" | "done">();
    const finished: string[] = [];
    for (const start of trees.keys()) {
      if (state.has(start)) continue;
      const stack = [{ name: start, next: 0 }];
      state.set(start, "open");
      for (let top = stack.at(-1); top !== undefined; top = stack.at(-1)) {
        const edge = trees.get(top.name)?.edges[top.next++];
        if (edge === undefined) {
          state.set(top.name, "done");
          finished.push(top.name);
          stack.pop();
        } else if (trees.has(edge.target)) {
          const seen = state.get(edge.target);
          if (seen === undefined) {
            state.set(edge.target, "open");
            stack.push({ name: edge.target, next: 0 });
          } else if (seen === "open") {
            const names = stack.map((entry) => entry.name);
            const loop = [...names.slice(names.indexOf(edge.target)), edge.target];
            this.cycles.set(edge.path, loop.map((name) => JSON.stringify(name)).join(" -> "));
          }
        }
      }
    }
    return finished;
  }

  /** Layers after expanding component instances (saturating), or the raw count with a cycle. */
  private countLayers(document: Tree, trees: ReadonlyMap<string, Tree>, order: string[]): number {
    const cap = DesignLimits.maxLayers + 1;
    let raw = document.layers;
    for (const tree of trees.values()) raw = Math.min(cap, raw + tree.layers);
    if (raw >= cap || this.cycles.size > 0) return raw;
    const expanded = new Map<string, number>();
    const size = (tree: Tree): number =>
      tree.edges.reduce(
        (total, edge) => Math.min(cap, total + (expanded.get(edge.target) ?? 0)),
        tree.layers,
      );
    for (const name of order) expanded.set(name, size(trees.get(name) as Tree));
    return size(document);
  }

  private add(path: string, code: DesignIssueCode, message: string): void {
    this.issues.add({ path, code, message });
  }
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

function fitsProp(definition: ComponentPropDefinition, value: unknown): boolean {
  if (typeof value === "string" && matches(binding, value)) return true;
  switch (definition.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "color":
      return typeof value === "string" && matches(colour, value);
  }
}

function matches(node: SchemaNode, value: unknown): boolean {
  const scratch = new IssueCollector();
  validateNode(designSchemaV0, node, value, "", scratch);
  return scratch.isEmpty;
}
