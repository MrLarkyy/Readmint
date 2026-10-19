import type { DataObject } from "@readmint/data";

/** Version of the registry data object; it changes only with a breaking change to its shape. */
export const REGISTRY_DATA_VERSION = 0;

/** Namespace the registry source binds under when the host names none. */
export const REGISTRY_DATA_DEFAULT_NAMESPACE = "registry";

/** One npm package as the registry knows it today. */
export interface NpmPackage {
  /** The name asked for. */
  readonly name: string;
  /** `version` of the `latest` dist-tag: printable ASCII, 1 to 64 characters. */
  readonly version: string;
  /** Downloads of the last 7 days, or `null` when the downloads API has no figure for the package. */
  readonly weeklyDownloads: number | null;
}

/** One Maven Central artifact. */
export interface MavenArtifact {
  readonly group: string;
  readonly artifact: string;
  /** The newest version Maven Central lists: printable ASCII, 1 to 64 characters. */
  readonly latestVersion: string;
  /** UTC date (`YYYY-MM-DD`) the newest version was published. */
  readonly updated: string;
}

/**
 * What the registry source binds. Both lists keep the order asked for; an entry the registry does not know is `null`
 * (the data object keeps its place so `npm[2]` is still the third package asked for).
 */
export interface RegistryData extends DataObject {
  readonly version: typeof REGISTRY_DATA_VERSION;
  readonly npm: readonly (NpmPackage | null)[];
  readonly maven: readonly (MavenArtifact | null)[];
}
