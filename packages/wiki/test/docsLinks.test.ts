import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { anchors, linkTargets } from "./markdown.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const docsDir = join(root, "docs");

const files = [
  join(root, "README.md"),
  ...readdirSync(docsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(docsDir, name)),
];

function read(file: string): string {
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

describe("links in docs/ and the root README", () => {
  for (const file of files) {
    it(`resolves every relative link of ${relative(root, file).replaceAll("\\", "/")}`, () => {
      for (const target of linkTargets(read(file))) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const [path = "", anchor] = target.split("#");
        const resolved = path === "" ? file : resolve(dirname(file), decodeURI(path));
        expect(existsSync(resolved), `${target} -> missing ${resolved}`).toBe(true);
        if (anchor !== undefined && resolved.endsWith(".md") && statSync(resolved).isFile()) {
          expect(anchors(read(resolved)).has(anchor), `${target}: no heading #${anchor}`).toBe(
            true,
          );
        }
      }
    });
  }
});
