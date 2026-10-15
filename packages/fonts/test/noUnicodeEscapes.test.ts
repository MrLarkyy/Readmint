import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const source = join(import.meta.dirname, "..", "src");

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(directory, entry.name)]
        : [],
  );
}

/**
 * Node and Chromium ship different Unicode versions in their RegExp and Intl data; shaping and bidi take every
 * character property from the package's own Unicode 16.0.0 tables, so both engines give the same glyphs.
 */
test("packages/fonts/src takes no Unicode data from RegExp property escapes, Intl or normalize", () => {
  const found: string[] = [];
  for (const file of files(source)) {
    const text = readFileSync(file, "utf8");
    for (const pattern of [/\\[pP]\{/u, /\bIntl\b/u, /\.normalize\(/u, /\.toLocale\w+\(/u]) {
      if (pattern.test(text)) found.push(`${file}: ${String(pattern)}`);
    }
  }
  expect(found).toEqual([]);
});
