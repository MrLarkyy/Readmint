import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const packagesDir = join(import.meta.dirname, "..", "..");

test("no other package lists @readmint/golden in its dependencies", () => {
  for (const name of readdirSync(packagesDir)) {
    if (name === "golden") continue;
    const manifest = JSON.parse(
      readFileSync(join(packagesDir, name, "package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      expect(Object.keys(manifest[field] ?? {}), `${name} ${field}`).not.toContain(
        "@readmint/golden",
      );
    }
  }
});
