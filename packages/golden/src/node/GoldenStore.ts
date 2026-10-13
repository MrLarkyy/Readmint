import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { goldenNamePattern } from "../GoldenSuite.js";

export type ArtefactKind =
  | "actual.svg"
  | "actual.png"
  | "diff.png"
  | "browser.png"
  | "browser-diff.png"
  | "node.svg"
  | "browser.svg";

const artefactKinds: ArtefactKind[] = [
  "actual.svg",
  "actual.png",
  "diff.png",
  "browser.png",
  "browser-diff.png",
  "node.svg",
  "browser.svg",
];

/** Committed goldens of one suite and the failure artefacts written next to the test results. */
export class GoldenStore {
  constructor(
    readonly goldenDir: string,
    readonly resultsDir: string,
  ) {}

  /** `suiteFile` is `<package>/test/<suite>.golden.ts` (path or file URL). */
  static forSuiteFile(suiteFile: string, resultsRoot?: string): GoldenStore {
    const file = suiteFile.startsWith("file:") ? fileURLToPath(suiteFile) : resolve(suiteFile);
    const suite = basename(file).replace(/\.golden(\.browser)?(\.test)?\.ts$/, "");
    if (!goldenNamePattern.test(suite))
      throw new Error(`golden suite file ${basename(file)} has an invalid name`);
    const testDir = dirname(file);
    const packageDir = dirname(testDir);
    const root =
      resultsRoot ??
      process.env["READMINT_GOLDEN_RESULTS"] ??
      join(findRepositoryRoot(testDir), "test-results", "golden");
    return new GoldenStore(join(testDir, "golden", suite), join(root, basename(packageDir), suite));
  }

  svgPath(fixture: string): string {
    return join(this.goldenDir, `${assertFixture(fixture)}.svg`);
  }

  pngPath(fixture: string): string {
    return join(this.goldenDir, `${assertFixture(fixture)}.png`);
  }

  artefactPath(fixture: string, kind: ArtefactKind): string {
    return join(this.resultsDir, `${assertFixture(fixture)}.${kind}`);
  }

  read(path: string): Buffer | undefined {
    return existsSync(path) ? readFileSync(path) : undefined;
  }

  /** Returns true when the file was written; identical bytes are left alone. */
  writeIfChanged(path: string, data: string | Uint8Array): boolean {
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    const current = this.read(path);
    if (current?.equals(bytes) === true) return false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return true;
  }

  writeArtefact(fixture: string, kind: ArtefactKind, data: string | Uint8Array): string {
    const path = this.artefactPath(fixture, kind);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    return path;
  }

  clearArtefacts(fixture: string): void {
    for (const kind of artefactKinds) rmSync(this.artefactPath(fixture, kind), { force: true });
  }

  /** Golden files in the suite directory that no fixture owns. */
  orphans(fixtures: readonly string[]): string[] {
    if (!existsSync(this.goldenDir)) return [];
    const owned = new Set(fixtures.flatMap((name) => [`${name}.svg`, `${name}.png`]));
    return readdirSync(this.goldenDir)
      .filter((file) => !owned.has(file))
      .sort()
      .map((file) => join(this.goldenDir, file));
  }

  removeOrphans(fixtures: readonly string[]): string[] {
    const orphans = this.orphans(fixtures);
    for (const path of orphans) rmSync(path, { force: true, recursive: true });
    return orphans;
  }
}

function assertFixture(name: string): string {
  if (!goldenNamePattern.test(name))
    throw new Error(`golden fixture name ${JSON.stringify(name)} is invalid`);
  return name;
}

function findRepositoryRoot(from: string): string {
  let dir = from;
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
  return dir;
}
