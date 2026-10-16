import { isDataNamespace } from "@readmint/data";
import { JSON_DATA_DEFAULT_NAMESPACE, JsonLimits } from "@readmint/data-json";

/** One JSON source of `--data-json` (CLI) or `data-json` (Action), with its `--data-json-header` headers. */
export interface DataJsonSpec {
  readonly namespace: string;
  /** A relative file path or an https URL, as given. */
  readonly source: string;
  /** Header name to the environment variable holding its value; never the value. */
  readonly headers: Readonly<Record<string, string>>;
}

/** JSON sources one command line or Action run may name. */
export const maxDataJsonSources = 8;

const NAMED_SOURCE = /^([a-z][a-z0-9]{0,31})=(.+)$/s;
const HEADER =
  /^([a-z][a-z0-9]{0,31}):([!#$%&'*+.^_`|~0-9A-Za-z-]+)=([A-Za-z_][A-Za-z0-9_]{0,127})$/;

/**
 * Parses `[<namespace>=]<source>` and `<namespace>:<Header-Name>=<ENV_NAME>` texts into specs in source order, or the
 * problems found. `<namespace>=` is taken only when it is a valid namespace, so a URL with `=` in its query stays one
 * source under `json`. Problems name namespaces and variables only: a source may hold a key in its query.
 */
export function parseDataJsonArgs(
  sources: readonly string[],
  headers: readonly string[],
): { readonly specs: readonly DataJsonSpec[]; readonly problems: readonly string[] } {
  const problems: string[] = [];
  if (sources.length > maxDataJsonSources) {
    problems.push(`at most ${String(maxDataJsonSources)} JSON sources may be given`);
  }
  const byNamespace = new Map<string, { source: string; headers: Map<string, string> }>();
  for (const text of sources) {
    const named = NAMED_SOURCE.exec(text);
    const [namespace, source] =
      named?.[1] !== undefined && named[2] !== undefined && isDataNamespace(named[1])
        ? [named[1], named[2]]
        : [JSON_DATA_DEFAULT_NAMESPACE, text];
    if (byNamespace.has(namespace)) {
      problems.push(`JSON namespace ${namespace} is given twice`);
      continue;
    }
    byNamespace.set(namespace, { source, headers: new Map() });
  }
  for (const text of headers) {
    const match = HEADER.exec(text);
    const [, namespace = "", name = "", envName = ""] = match ?? [];
    if (match === null || !isDataNamespace(namespace)) {
      problems.push("a JSON header must be <namespace>:<Header-Name>=<ENV_NAME>");
      continue;
    }
    const spec = byNamespace.get(namespace);
    if (spec === undefined) {
      problems.push(`a JSON header names namespace ${namespace}, which has no JSON source`);
      continue;
    }
    const lower = name.toLowerCase();
    if (spec.headers.has(lower)) {
      problems.push(`JSON header ${lower} of namespace ${namespace} is given twice`);
      continue;
    }
    spec.headers.set(lower, envName);
    if (spec.headers.size > JsonLimits.maxHeaders) {
      problems.push(
        `namespace ${namespace} has more than ${String(JsonLimits.maxHeaders)} JSON headers`,
      );
    }
  }
  const specs = [...byNamespace].map(([namespace, { source, headers: named }]) => ({
    namespace,
    source,
    headers: Object.fromEntries(named),
  }));
  return { specs, problems: [...new Set(problems)] };
}
