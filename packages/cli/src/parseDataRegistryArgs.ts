import { isDataNamespace } from "@readmint/data";
import {
  isMavenCoordinate,
  isNpmPackageName,
  REGISTRY_DATA_DEFAULT_NAMESPACE,
  RegistryLimits,
} from "@readmint/data-registry";

/** One registry source of `--data-registry` (CLI) or `data-registry` (Action): the entries of one namespace. */
export interface DataRegistrySpec {
  readonly namespace: string;
  /** npm package names, in the order given. */
  readonly npm: readonly string[];
  /** Maven coordinates (`group:artifact`), in the order given. */
  readonly maven: readonly string[];
}

/** Registry namespaces one command line or Action run may name. */
export const maxDataRegistrySources = 4;

const NAMED_SOURCE = /^([a-z][a-z0-9]{0,31})=(.*)$/s;

/**
 * Parses `[<namespace>=]npm:<name>` and `[<namespace>=]maven:<group>:<artifact>` texts into one spec per namespace
 * (the first use fixes the order), the entries in the order given, or the problems found. `<namespace>=` is taken
 * only when it is a valid namespace. Problems name the entry by its position and the fixed rules only, never a value.
 */
export function parseDataRegistryArgs(sources: readonly string[]): {
  readonly specs: readonly DataRegistrySpec[];
  readonly problems: readonly string[];
} {
  const problems: string[] = [];
  const byNamespace = new Map<string, { npm: string[]; maven: string[] }>();
  sources.forEach((text, index) => {
    const named = NAMED_SOURCE.exec(text);
    const [namespace, entry] =
      named?.[1] !== undefined && named[2] !== undefined && isDataNamespace(named[1])
        ? [named[1], named[2]]
        : [REGISTRY_DATA_DEFAULT_NAMESPACE, text];
    const position = `registry entry ${String(index + 1)}`;
    const kind = entry.startsWith("npm:")
      ? "npm"
      : entry.startsWith("maven:")
        ? "maven"
        : undefined;
    if (kind === undefined) {
      problems.push(`${position} must be npm:<name> or maven:<group>:<artifact>`);
      return;
    }
    const value = entry.slice(kind.length + 1);
    if (kind === "npm" ? !isNpmPackageName(value) : !isMavenCoordinate(value)) {
      problems.push(
        kind === "npm"
          ? `${position} is not a valid npm package name`
          : `${position} is not a Maven coordinate (group:artifact)`,
      );
      return;
    }
    const lists = byNamespace.get(namespace) ?? { npm: [], maven: [] };
    byNamespace.set(namespace, lists);
    const list = lists[kind];
    if (list.includes(value)) {
      problems.push(`${position} repeats an earlier entry of namespace ${namespace}`);
      return;
    }
    list.push(value);
    if (list.length > RegistryLimits.maxEntries) {
      problems.push(
        `at most ${String(RegistryLimits.maxEntries)} ${kind} entries may be given per namespace (${namespace})`,
      );
    }
  });
  if (byNamespace.size > maxDataRegistrySources) {
    problems.push(`at most ${String(maxDataRegistrySources)} registry namespaces may be given`);
  }
  const specs = [...byNamespace].map(([namespace, { npm, maven }]) => ({ namespace, npm, maven }));
  return { specs, problems: [...new Set(problems)] };
}
