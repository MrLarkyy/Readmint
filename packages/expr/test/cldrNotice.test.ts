import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, test } from "vitest";

const packageRoot = new URL("../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, packageRoot), "utf8");

const markers = [
  "@license Unicode-3.0",
  "UNICODE LICENSE V3",
  "Copyright © 1991-2025 Unicode, Inc.",
  "provided that either (a) this copyright and permission notice appear with all copies",
  "without prior written authorization of the copyright holder.",
];

test("the CLDR notice survives the TypeScript emit of locales.ts", () => {
  const tsconfig = JSON.parse(read("../../tsconfig.base.json")) as {
    compilerOptions: Record<string, unknown>;
  };
  const { options } = ts.convertCompilerOptionsFromJson(tsconfig.compilerOptions, ".");
  const emitted = ts.transpileModule(read("src/locales.ts"), {
    compilerOptions: { ...options, declaration: false, sourceMap: false, declarationMap: false },
    fileName: "locales.ts",
  }).outputText;
  for (const marker of markers) expect(emitted).toContain(marker);
  expect(emitted.indexOf("UNICODE LICENSE V3")).toBeLessThan(emitted.indexOf("const nbsp"));
});

test("the package ships LICENSE-CLDR with the same notice", () => {
  const licence = read("LICENSE-CLDR");
  for (const marker of markers.slice(1)) expect(licence).toContain(marker);
  const manifest = JSON.parse(read("package.json")) as { files?: string[] };
  expect(manifest.files).toEqual(["dist", "LICENSE-CLDR"]);
});
