/** The only hosts a load contacts, all over HTTPS. */
export const REGISTRY_HOSTS: readonly string[] = Object.freeze([
  "registry.npmjs.org",
  "api.npmjs.org",
  "repo1.maven.org",
]);

// Built only from names that passed isNpmPackageName / isMavenCoordinate: their characters are URL-safe as they are.

/** The manifest of the `latest` dist-tag: small, unlike the packument of all versions. */
export function npmLatestUrl(name: string): string {
  return `https://registry.npmjs.org/${name}/latest`;
}

export function npmDownloadsUrl(name: string): string {
  return `https://api.npmjs.org/downloads/point/last-week/${name}`;
}

/** The artifact's `maven-metadata.xml` in Maven Central's own repository: always current, and fast. */
export function mavenMetadataUrl(group: string, artifact: string): string {
  return `https://repo1.maven.org/maven2/${group.replaceAll(".", "/")}/${artifact}/maven-metadata.xml`;
}
