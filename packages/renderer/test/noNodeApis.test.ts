import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const packagesDir = join(import.meta.dirname, "..", "..");
// expr is part of the render path: the renderer evaluates every binding with it.
const shared = ["renderer", "fonts", "expr"];
// Pure ECMAScript npm code the fonts package decodes and encodes with (WOFF zlib, WOFF2 Brotli).
const allowedPackages = ["fflate", "brotli/decompress.js"];

function sources(name: string): { file: string; code: string }[] {
  const dir = join(packagesDir, name, "src");
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file: `${name}/src/${file}`, code: readFileSync(join(dir, file), "utf8") }));
}

/** Comments may name what the code must not use; strings and code are what count. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:"'])\/\/.*$/gmu, "$1");
}

const forbidden: readonly [RegExp, string][] = [
  [/["']node:/u, "node: modules"],
  [/\bBuffer\b/u, "Buffer"],
  [/\bprocess\b/u, "process"],
  [/\bText(?:En|De)coder\b/u, "TextEncoder/TextDecoder"],
  [/\b(?:atob|btoa)\b/u, "atob/btoa"],
  [/\bIntl\b/u, "Intl"],
  [/\bDate\b/u, "Date"],
  [/Math\.random/u, "Math.random"],
  [/\blocaleCompare\b|\btoLocale\w*/u, "locale-dependent formatting"],
  [
    /Math\.(?:sin|cos|tan|asin|acos|atan2?|pow|exp|expm1|log\w*|hypot|cbrt|sinh|cosh|tanh)\b/u,
    "transcendental Math",
  ],
  [/\*\*/u, "the ** operator"],
  [/\beval\b|new Function\b/u, "eval"],
  [/\b(?:window|document|globalThis|navigator|self)\b/u, "platform globals"],
  [/\brequire\(/u, "require"],
];

describe("shared renderer code uses only ECMAScript", () => {
  for (const name of shared) {
    for (const { file, code } of sources(name)) {
      test(file, () => {
        const plain = withoutComments(code);
        for (const [pattern, what] of forbidden)
          expect(plain, `${file} uses ${what}`).not.toMatch(pattern);
        for (const match of plain.matchAll(/\bfrom\s+"([^"]+)"/gu)) {
          const specifier = match[1] ?? "";
          expect(
            specifier.startsWith("./") ||
              allowedPackages.includes(specifier) ||
              specifier === "@readmint/format" ||
              specifier === "@readmint/fonts" ||
              specifier === "@readmint/expr",
            `${file} imports ${specifier}`,
          ).toBe(true);
        }
      });
    }
  }
});

test("renderer, fonts, expr and format compile with the ES2023 library and no ambient types", () => {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    lib: ["lib.es2023.d.ts"],
    types: [],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
    noEmit: true,
    baseUrl: packagesDir,
    paths: {
      "@readmint/format": ["format/src/index.ts"],
      "@readmint/fonts": ["fonts/src/index.ts"],
      "@readmint/expr": ["expr/src/index.ts"],
    },
  };
  const roots = ["renderer", "fonts", "expr", "format"].map((name) =>
    join(packagesDir, name, "src", "index.ts"),
  );
  const program = ts.createProgram(roots, options);
  const problems = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const where = diagnostic.file?.fileName.replace(packagesDir, "") ?? "";
    return `${where}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
  });
  expect(problems).toEqual([]);
}, 60_000);
