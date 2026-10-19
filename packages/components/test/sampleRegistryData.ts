import type { MavenArtifact, NpmPackage, RegistryData } from "@readmint/data-registry";

/** A typical project's libraries (synthetic numbers). */
export function sampleRegistryData(): { registry: RegistryData } {
  return {
    registry: {
      version: 0,
      npm: [
        { name: "react", version: "19.1.0", weeklyDownloads: 31_500_000 },
        { name: "@types/node", version: "22.15.3", weeklyDownloads: 98_000_000 },
        { name: "typescript", version: "5.9.3", weeklyDownloads: 74_200_000 },
        { name: "vitest", version: "5.0.4", weeklyDownloads: 18_900_000 },
      ],
      maven: [
        {
          group: "org.jetbrains.kotlin",
          artifact: "kotlin-stdlib",
          latestVersion: "2.1.20",
          updated: "2025-03-26",
        },
        { group: "junit", artifact: "junit", latestVersion: "4.13.2", updated: "2020-12-15" },
      ],
    },
  };
}

/**
 * The longest data the source can return: 20 entries per list with 214-character npm names, 128-character Maven
 * parts and 64-character versions.
 */
export function longRegistryData(): { registry: RegistryData } {
  const npm: NpmPackage[] = Array.from({ length: 20 }, (_, i) => ({
    name: `@${"scope".repeat(8)}/${String(i)}${"Wide".repeat(40)}`.slice(0, 214),
    version: `${String(i + 1)}.0.0-${"beta".repeat(16)}`.slice(0, 64),
    weeklyDownloads: 9_007_199_254_740_991 - i,
  }));
  const maven: MavenArtifact[] = Array.from({ length: 20 }, (_, i) => ({
    group: `${"org.example.".repeat(10)}${String(i)}`.slice(0, 128),
    artifact: `${"artifact-".repeat(16)}${String(i)}`.slice(0, 128),
    latestVersion: `${String(i + 1)}.0.0-${"rc".repeat(32)}`.slice(0, 64),
    updated: "2026-10-17",
  }));
  return { registry: { version: 0, npm, maven } };
}

/** What a load leaves when the registries do not know some entries, and a package without a download figure. */
export function missingRegistryData(): { registry: RegistryData } {
  return {
    registry: {
      version: 0,
      npm: [
        null,
        { name: "react", version: "19.1.0", weeklyDownloads: 31_500_000 },
        { name: "brand-new-package", version: "0.0.1", weeklyDownloads: null },
        null,
      ],
      maven: [
        null,
        { group: "junit", artifact: "junit", latestVersion: "4.13.2", updated: "2020-12-15" },
      ],
    },
  };
}

/** Nothing found: every entry unknown, or none asked for. */
export function emptyRegistryData(): { registry: RegistryData } {
  return { registry: { version: 0, npm: [null], maven: [] } };
}
