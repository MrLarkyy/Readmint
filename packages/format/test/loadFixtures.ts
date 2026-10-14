import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Fixture {
  readonly file: string;
  readonly name: string;
  readonly source: string;
  readonly format: "json" | "yaml";
  /** Invalid fixtures only: the exact `[{path, code}]` list. */
  readonly expected?: readonly { readonly path: string; readonly code: string }[];
}

const fixturesDir = join(import.meta.dirname, "fixtures");
const designFile = /^(?<name>.+)\.design\.(?<format>json|yaml)$/u;

export function loadFixtures(kind: "valid" | "invalid"): Fixture[] {
  const dir = join(fixturesDir, kind);
  return readdirSync(dir)
    .sort()
    .flatMap((file) => {
      const match = designFile.exec(file)?.groups;
      if (match?.["name"] === undefined) return [];
      const name = match["name"];
      const source = readFileSync(join(dir, file), "utf8");
      const format = match["format"] === "yaml" ? "yaml" : "json";
      if (kind === "valid") return [{ file, name, source, format }];
      const expected = JSON.parse(
        readFileSync(join(dir, `${name}.expected.json`), "utf8"),
      ) as Fixture["expected"];
      return [{ file, name, source, format, expected }];
    });
}
