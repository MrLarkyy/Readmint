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

/**
 * Hides the message of every issue that could show a value of a design's settings section, whatever path it was
 * reported at: an issue inside a prop the settings wrote (a bad binding), or one whose message holds a string value
 * of the section (raw, JSON-escaped or log-escaped, clipped echoes included) or one of its numbers (a child layer
 * the value broke). The code and path stay; the message names the section and the props, never a value.
 */
export class SettingsMask {
  private readonly section: string;
  private readonly pointers = new Map<string, string>();
  private readonly traces: readonly Trace[];

  /** `design` is the design `applyDesignProps` returned for `props`, the section `section` of the settings file. */
  constructor(
    section: string,
    props: Readonly<Record<string, ComponentPropValue>>,
    design: Design,
  ) {
    this.section = section;
    design.layers.forEach((layer, index) => {
      if (layer.type !== "component") return;
      const declared = design.components?.[layer.ref]?.props ?? {};
      for (const name of Object.keys(props)) {
        if (Object.hasOwn(declared, name)) {
          this.pointers.set(`/layers/${String(index)}/props/${name}`, name);
        }
      }
    });
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
    for (const trace of this.traces) {
      if (trace.test(issue.message)) names.add(trace.name);
    }
    if (names.size === 0) return issue;
    const listed = [...names].sort().map(quoteForLog).join(", ");
    return {
      ...issue,
      message: `a value of settings section ${quoteForLog(this.section)} (${names.size === 1 ? "prop" : "props"} ${listed}) is not valid here; the message is hidden so the value is not shown`,
    };
  }
}

function traceOf(value: ComponentPropValue): ((message: string) => boolean) | undefined {
  if (typeof value === "number") {
    const pattern = new RegExp(
      `(?<![\\w.])${String(value).replace(/[.+]/g, "\\$&")}(?!\\w|\\.\\d)`,
    );
    return (message) => pattern.test(message);
  }
  // A boolean is no personal text, and "true" / "false" appear in many messages; its pointer still masks it.
  if (typeof value !== "string" || value === "") return undefined;
  const head = Array.from(value).slice(0, traceLength).join("");
  const forms = [
    ...new Set([head, JSON.stringify(head).slice(1, -1), quoteForLog(head).slice(1, -1)]),
  ];
  return (message) => forms.some((form) => message.includes(form));
}
