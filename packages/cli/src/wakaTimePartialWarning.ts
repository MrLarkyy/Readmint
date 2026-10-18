/**
 * The one line the CLI and the Action print when WakaTime answered while still calculating (HTTP 202, or stats not up
 * to date): the namespace and what it means. It holds no data and no key.
 */
export function wakaTimePartialWarning(namespace: string): string {
  return `WakaTime data ${namespace} is incomplete: WakaTime is still calculating the stats, so the numbers may be low or empty (run again later; this answer was not cached)`;
}
