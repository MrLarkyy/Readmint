import { count, day, own, version } from "./answerFields.js";
import type { MavenArtifact, NpmPackage } from "./RegistryData.js";

/**
 * A cache entry checked like a fresh answer and rebuilt, or `null` when it is not the entry of `name`: a corrupt or
 * foreign entry is a miss, never data.
 */
export function readStoredNpm(stored: string, name: string): NpmPackage | null {
  try {
    const value = object(stored);
    if (value === null || own(value, "name") !== name) return null;
    const downloads = own(value, "weeklyDownloads");
    return Object.freeze({
      name,
      version: version(own(value, "version"), "version"),
      weeklyDownloads: downloads === null ? null : count(downloads, "weeklyDownloads"),
    });
  } catch {
    return null;
  }
}

export function readStoredMaven(
  stored: string,
  group: string,
  artifact: string,
): MavenArtifact | null {
  try {
    const value = object(stored);
    if (value === null || own(value, "group") !== group || own(value, "artifact") !== artifact) {
      return null;
    }
    return Object.freeze({
      group,
      artifact,
      latestVersion: version(own(value, "latestVersion"), "latestVersion"),
      updated: day(own(value, "updated"), "updated"),
    });
  } catch {
    return null;
  }
}

function object(stored: string): object | null {
  const value: unknown = JSON.parse(stored);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
