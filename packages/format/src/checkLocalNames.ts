import type { ComponentDefinition, Design, Layer, Repeat } from "./Design.js";
import type { IssueCollector } from "./IssueCollector.js";
import { jsonPointer } from "./jsonPointer.js";
import { LocalNames } from "./LocalNames.js";
import { quoteInput } from "./quoteInput.js";

/** Where a local name is bound, and by what: shadowing a `let` name is refused, shadowing a repeat name by a repeat is not. */
interface Bound {
  readonly kind: "let" | "repeat";
  readonly path: string;
}

const reserved: ReadonlySet<string> = new Set(LocalNames.reserved);

/**
 * Checks the local names of a structurally valid design: a `let` name is not reserved and is not bound already by the
 * same layer's repeat or by an enclosing layer's `let` or repeat; a repeat name does not hide an enclosing `let` name.
 * When the design has a `palette`, neither a `let` nor a repeat may take that name.
 * The document and each component definition are separate trees (a definition's callers are unknown statically).
 * Names live in Maps and Sets only, so `__proto__` or `constructor` is a plain name. Document order is kept.
 */
export function checkLocalNames(design: Design, issues: IssueCollector): void {
  const palette = design.palette !== undefined;
  for (const key of Object.keys(design)) {
    if (key === "layers") new LocalNameWalker(issues, palette).walkLayers(design.layers, "/layers");
    else if (key === "components") {
      const components = design.components ?? {};
      for (const name of Object.keys(components)) {
        const definition = components[name] as ComponentDefinition;
        const path = jsonPointer(jsonPointer("/components", name), "layers");
        new LocalNameWalker(issues, palette).walkLayers(definition.layers, path);
      }
    }
  }
}

class LocalNameWalker {
  /**
   * The names the enclosing layers bind. One map, set on the way into a group's children and restored on the way out,
   * so the work grows with the names bound, not with layers times names.
   */
  private readonly enclosing = new Map<string, Bound>();

  constructor(
    private readonly issues: IssueCollector,
    /** Whether the design declares a palette, which reserves the name `palette`. */
    private readonly palette: boolean,
  ) {}

  walkLayers(layers: readonly Layer[], path: string): void {
    layers.forEach((layer, index) => {
      if (this.issues.isFull()) return;
      this.checkLayer(layer, jsonPointer(path, index));
    });
  }

  private checkLayer(layer: Layer, path: string): void {
    const own = repeatNames(layer.repeat, jsonPointer(path, "repeat"));
    const letPath = jsonPointer(path, "let");
    for (const key of Object.keys(layer)) {
      if (key === "repeat") this.checkRepeat(own);
      else if (key === "let" && layer.let !== undefined) this.checkLet(layer.let, letPath, own);
      else if (key === "children" && layer.type === "group") {
        // Every name of the layer, also when `children` comes before `let` in the document.
        const inner = new Map(own);
        for (const name of Object.keys(layer.let ?? {}))
          inner.set(name, { kind: "let", path: jsonPointer(letPath, name) });
        this.within(inner, () => {
          this.walkLayers(layer.children, jsonPointer(path, "children"));
        });
      }
    }
  }

  private within(names: ReadonlyMap<string, Bound>, body: () => void): void {
    const saved = [...names.keys()].map((name) => [name, this.enclosing.get(name)] as const);
    for (const [name, bound] of names) this.enclosing.set(name, bound);
    body();
    for (const [name, bound] of saved) {
      if (bound === undefined) this.enclosing.delete(name);
      else this.enclosing.set(name, bound);
    }
  }

  private checkRepeat(own: ReadonlyMap<string, Bound>): void {
    for (const [name, bound] of own) {
      if (this.isPalette(name)) {
        this.issues.add({
          path: bound.path,
          code: "reserved-name",
          message: `${quoteInput(name)} is reserved by the design's palette and cannot be a repeat name`,
        });
        continue;
      }
      const outer = this.enclosing.get(name);
      if (outer?.kind !== "let") continue;
      this.issues.add({
        path: bound.path,
        code: "duplicate-name",
        message: `repeat name ${quoteInput(name)} hides the let name bound at ${outer.path}`,
      });
    }
  }

  private isPalette(name: string): boolean {
    return this.palette && name === "palette";
  }

  private checkLet(
    bindings: Readonly<Record<string, string>>,
    path: string,
    own: ReadonlyMap<string, Bound>,
  ): void {
    for (const name of Object.keys(bindings)) {
      const at = jsonPointer(path, name);
      const first = own.get(name) ?? this.enclosing.get(name);
      if (reserved.has(name)) {
        this.issues.add({
          path: at,
          code: "reserved-name",
          message: `${quoteInput(name)} is reserved and cannot be a let name`,
        });
      } else if (this.isPalette(name)) {
        this.issues.add({
          path: at,
          code: "reserved-name",
          message: `${quoteInput(name)} is reserved by the design's palette and cannot be a let name`,
        });
      } else if (first !== undefined) {
        this.issues.add({
          path: at,
          code: "duplicate-name",
          message: `let name ${quoteInput(name)} is already bound by the ${first.kind} at ${first.path}`,
        });
      }
    }
  }
}

/** The item and index names a repeat binds, each with the pointer an issue about it names. */
function repeatNames(repeat: Repeat | undefined, path: string): ReadonlyMap<string, Bound> {
  const names = new Map<string, Bound>();
  if (repeat === undefined) return names;
  names.set(repeat.as ?? "item", {
    kind: "repeat",
    path: repeat.as === undefined ? path : jsonPointer(path, "as"),
  });
  names.set(repeat.index ?? "index", {
    kind: "repeat",
    path: repeat.index === undefined ? path : jsonPointer(path, "index"),
  });
  return names;
}
