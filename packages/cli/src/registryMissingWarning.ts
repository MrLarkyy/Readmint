const shownEntries = 5;

/**
 * The one line the CLI and the Action print when a registry does not know entries asked for: the namespace and the
 * first entries (`npm:<name>`, `maven:<group>:<artifact>`: validated names, no secret). They are `null` in the data.
 */
export function registryMissingWarning(namespace: string, missing: readonly string[]): string {
  const shown = missing.slice(0, shownEntries).join(", ");
  const more =
    missing.length > shownEntries ? ` and ${String(missing.length - shownEntries)} more` : "";
  return `Registry data ${namespace} has ${String(missing.length)} unknown ${missing.length === 1 ? "entry" : "entries"}: ${shown}${more}; each is null in the data and was not cached`;
}
