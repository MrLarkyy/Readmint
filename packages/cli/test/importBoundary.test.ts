import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const packagesDir = join(import.meta.dirname, "..", "..");
// Packages that run in the browser or are shared with it: the cli's filesystem code stays out.
const browserSide = ["renderer", "format", "editor", "components", "expr", "fonts", "raster"];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

test("no browser-side package depends on or imports @readmint/cli", () => {
  for (const name of browserSide) {
    const dir = join(packagesDir, name);
    expect(existsSync(dir), dir).toBe(true);
    for (const file of [join(dir, "package.json"), ...files(join(dir, "src"))]) {
      if (!existsSync(file)) continue;
      expect(readFileSync(file, "utf8"), file).not.toContain("@readmint/cli");
    }
  }
});
