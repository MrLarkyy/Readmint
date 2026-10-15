import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { expect, test } from "vitest";

interface Output {
  readonly type: "chunk" | "asset";
  readonly fileName: string;
  readonly isEntry?: boolean;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

const source = (name: string) =>
  fileURLToPath(new URL(`../../${name}/src/index.ts`, import.meta.url));

async function bundle(entry: string, minify: boolean): Promise<Output[]> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    resolve: {
      alias: ["data", "expr", "fonts", "format", "renderer"].map((name) => ({
        find: new RegExp(`^@readmint/${name}$`),
        replacement: source(name),
      })),
    },
    worker: { format: "es" },
    build: {
      write: false,
      minify,
      target: "es2023",
      rollupOptions: { input: entry, output: { format: "es" }, preserveEntrySignatures: "strict" },
    },
  });
  return (Array.isArray(result) ? result : [result]).flatMap(
    (one) => (one as { output: Output[] }).output,
  );
}

const text = (output: Output) =>
  output.code ??
  (typeof output.source === "string"
    ? output.source
    : new TextDecoder().decode(output.source ?? new Uint8Array()));
const gzipBytes = (output: Output) => gzipSync(text(output)).length;
const entry = (outputs: readonly Output[]) =>
  outputs.find((output) => output.type === "chunk" && output.isEntry === true);
const worker = (outputs: readonly Output[]) =>
  outputs.find((output) => output.fileName.includes("previewWorker"));

const yamlMarker = /YAMLParseError|class Composer/u;
const rendererMarker = /function renderSvg\b/u;
const fontParserMarker = /function parseSfnt\b/u;

test("the initial chunk of the editor library leaves out the YAML parser", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/index.ts", import.meta.url)), false);
  expect(text(entry(outputs) ?? { type: "chunk", fileName: "" })).not.toMatch(yamlMarker);
  expect(outputs.filter((output) => yamlMarker.test(text(output)))).toHaveLength(1);
});

test("the app loads the YAML parser and the font parser on demand and renders only in the worker", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/main.ts", import.meta.url)), false);
  const main = entry(outputs);
  const render = worker(outputs);
  expect(main).toBeDefined();
  expect(render).toBeDefined();
  if (main === undefined || render === undefined) return;
  for (const marker of [yamlMarker, rendererMarker, fontParserMarker]) {
    expect(text(main)).not.toMatch(marker);
  }
  expect(text(render)).toMatch(rendererMarker);
  expect(
    outputs.filter((output) => rendererMarker.test(text(output))).map((output) => output.fileName),
  ).toEqual([render.fileName]);
  expect(outputs.some((output) => output !== render && fontParserMarker.test(text(output)))).toBe(
    true,
  );
});

test("the app stays within its gzip budgets: main chunk 120 kB, preview worker 250 kB", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/main.ts", import.meta.url)), true);
  const main = entry(outputs);
  const render = worker(outputs);
  if (main === undefined || render === undefined) throw new Error("app bundle is incomplete");
  expect(gzipBytes(main)).toBeLessThanOrEqual(120_000);
  expect(gzipBytes(render)).toBeLessThanOrEqual(250_000);
});
