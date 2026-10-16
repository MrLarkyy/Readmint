import type { Budget } from "./Budget.js";
import { checkValue, readOwn, type PropertyRead } from "./readProperty.js";
import type { TextMeasurer } from "./TextMeasurer.js";

export interface ScopeOptions {
  /** BCP 47 tag of the locale filters format for; default `en`. */
  readonly locale?: string;
  /** Shared by every evaluation in this scope and its children; default: a fresh budget each time. */
  readonly budget?: Budget;
  /** Measures text for `textWidth` and `truncateWidth`; the renderer supplies it. */
  readonly measurer?: TextMeasurer;
}

/** What names an expression can reach: locals first, then the own top-level keys of the data. */
export interface Scope {
  readonly locale: string;
  readonly budget: Budget | undefined;
  /** Optional, so a scope built by hand without one still fits; the measuring filters then fail. */
  readonly measurer?: TextMeasurer | undefined;
  /** `undefined` when neither a local nor the data has `name`. */
  lookup(name: string): PropertyRead | undefined;
  /** A child scope whose locals shadow this scope's locals and data; this scope is unchanged. */
  with(locals: Readonly<Record<string, unknown>>): Scope;
}

export function createScope(
  data: Readonly<Record<string, unknown>>,
  options: ScopeOptions = {},
): Scope {
  const plain = !Array.isArray(data) && checkValue(data).ok;
  const root = plain ? data : undefined;
  return makeScope(root, new Map(), {
    locale: options.locale ?? "en",
    budget: options.budget,
    measurer: options.measurer,
  });
}

/** `data` is `undefined` when it is not a plain object: every data name then reads as invalid. */
function makeScope(
  data: Readonly<Record<string, unknown>> | undefined,
  locals: ReadonlyMap<string, PropertyRead>,
  shared: Pick<Scope, "locale" | "budget" | "measurer">,
): Scope {
  return Object.freeze({
    locale: shared.locale,
    budget: shared.budget,
    measurer: shared.measurer,
    lookup(name: string): PropertyRead | undefined {
      const local = locals.get(name);
      if (local !== undefined) return local;
      if (data === undefined) return { ok: false };
      if (!Object.hasOwn(data, name)) return undefined;
      return readOwn(data, name);
    },
    with(added: Readonly<Record<string, unknown>>): Scope {
      const layered = new Map(locals);
      for (const name of Object.keys(added)) layered.set(name, readOwn(added, name));
      return makeScope(data, layered, shared);
    },
  });
}
