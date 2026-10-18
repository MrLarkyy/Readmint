/** The only hosts a load contacts, all over HTTPS. */
export const REGISTRY_HOSTS: readonly string[] = Object.freeze([
  "registry.npmjs.org",
  "api.npmjs.org",
  "search.maven.org",
]);

// Built only from names that passed isNpmPackageName / isMavenCoordinate: their characters are URL-safe as they are.

/** The manifest of the `latest` dist-tag: small, unlike the packument of all versions. */
export function npmLatestUrl(name: string): string {
  return `https://registry.npmjs.org/${name}/latest`;
}

export function npmDownloadsUrl(name: string): string {
  return `https://api.npmjs.org/downloads/point/last-week/${name}`;
}

export function mavenSearchUrl(group: string, artifact: string): string {
  const query = new URLSearchParams({
    q: `g:"${group}" AND a:"${artifact}"`,
    rows: "1",
    wt: "json",
  });
  return `https://search.maven.org/solrsearch/select?${query.toString()}`;
}
