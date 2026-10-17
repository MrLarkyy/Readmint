import type { ComponentPropValue, Design } from "@readmint/format";
import { quoteForLog } from "./quoteForLog.js";

/** The shape every issue the CLI prints shares (`DesignIssue`, `RenderIssue`). */
interface MaskableIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

interface Trace {
  readonly name: string;
  readonly test: (message: string) => boolean;
}

/** Leading code points of a string value looked for in a message: enough to spot an echo, short enough to survive clipping. */
const traceLength = 12;

/** The renderer's note of the component instances and repeat items around an issue: design text, never a value. */
const where =
  / \((?:in component instance [^,()]*|repeat item \d+)(?:, (?:in component instance [^,()]*|repeat item \d+))*\)$/;

/**
 * Hides the message of an issue that could show a value of a design's settings section. An issue inside a prop the
 * settings wrote (a bad binding) is always hidden. One inside a component the written instances use, nested ones
 * included (where the renderer reports a child layer the value broke), or on the canvas (whose bindings read the root
 * instance's props), is hidden when its message, without the
 * renderer's trailing note of instances and repeat items, holds a string value of the section quoted as the renderer
 * echoes it (`"` and the JSON-escaped start, clipped echoes included) or one of its numbers where the renderer echoes a
 * number (`got 7`, `gives 7`, `7 is outside ...`). A `binding` issue there is not searched: expression messages name
 * types, and the source they quote is the design's own text. Every other issue stays as it is. The code and path stay; the message names the section and the props,
 * never a value.
 */
export class SettingsMask {
  private readonly label: string;
  private readonly pointers = new Map<string, string>();
  private readonly scopes = new Set<string>();
  private readonly traces: readonly Trace[];

  /**
   * `design` is the design `applyDesignProps` returned for `props`, the section `section` of the settings file;
   * `label` names the source of the props in a hidden message when it is not that section (a manifest render).
   */
  constructor(
    section: string,
    props: Readonly<Record<string, ComponentPropValue>>,
    design: Design,
    label?: string,
  ) {
    this.label = label ?? `settings section ${quoteForLog(section)}`;
    const refs: string[] = [];
    design.layers.forEach((layer, index) => {
      if (layer.type !== "component") return;
      const declared = design.components?.[layer.ref]?.props ?? {};
      for (const name of Object.keys(props)) {
        if (Object.hasOwn(declared, name)) {
          this.pointers.set(`/layers/${String(index)}/props/${name}`, name);
          refs.push(layer.ref);
        }
      }
    });
    // Canvas bindings read the props of the root instance, so a written value can break the canvas too.
    if (refs.length > 0) this.scopes.add("/canvas/");
    const seen = new Set<string>();
    while (refs.length > 0) {
      const ref = refs.pop() as string;
      const component = design.components?.[ref];
      if (seen.has(ref) || component === undefined) continue;
      seen.add(ref);
      this.scopes.add(`/components/${ref}/`);
      collectRefs(component.layers, refs);
    }
    this.traces = Object.entries(props).flatMap(([name, value]) =>
      (Array.isArray(value) ? value : [value]).flatMap((item: ComponentPropValue) => {
        const test = traceOf(item);
        return test === undefined ? [] : [{ name, test }];
      }),
    );
  }

  /** `issue` itself, or a copy whose message cannot quote a settings value. */
  mask<T extends MaskableIssue>(issue: T): T {
    const names = new Set<string>();
    for (const [pointer, name] of this.pointers) {
      if (issue.path === pointer || issue.path.startsWith(`${pointer}/`)) names.add(name);
    }
    if (
      names.size === 0 &&
      issue.code !== "binding" &&
      [...this.scopes].some((scope) => issue.path.startsWith(scope))
    ) {
      const message = issue.message.replace(where, "");
      for (const trace of this.traces) {
        if (trace.test(message)) names.add(trace.name);
      }
    }
    if (names.size === 0) return issue;
    const listed = [...names].sort().map(quoteForLog).join(", ");
    return {
      ...issue,
      message: `a value of ${this.label} (${names.size === 1 ? "prop" : "props"} ${listed}) is not valid here; the message is hidden so the value is not shown`,
    };
  }
}

/** Pushes the `ref` of every component layer below `value` (a component's layers, groups included). */
function collectRefs(value: unknown, refs: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Readonly<Record<string, unknown>>;
  if (record.type === "component" && typeof record.ref === "string") refs.push(record.ref);
  for (const child of Object.values(record)) {
    if (typeof child === "object") collectRefs(child, refs);
  }
}

function traceOf(value: ComponentPropValue): ((message: string) => boolean) | undefined {
  if (typeof value === "number") {
    const pattern = new RegExp(
      `(?:^|got |gives )${String(value).replace(/[.+]/g, "\\$&")}(?!\\w|\\.\\d)`,
    );
    return (message) => pattern.test(message);
  }
  // A boolean is no personal text, and "true" / "false" appear in many messages; its pointer still masks it.
  if (typeof value !== "string" || value === "") return undefined;
  const head = Array.from(value).slice(0, traceLength).join("");
  // The opening quote and the escaped start: the renderer's echo (JSON) and the CLI's log quoting.
  const forms = [...new Set([JSON.stringify(head).slice(0, -1), quoteForLog(head).slice(0, -1)])];
  return (message) => forms.some((form) => message.includes(form));
}
