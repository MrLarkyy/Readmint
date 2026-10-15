import { readFileSync } from "node:fs";
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
const rasterBrowser = fileURLToPath(new URL("../../raster/src/browser.ts", import.meta.url));

async function bundle(entry: string, minify: boolean): Promise<Output[]> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    resolve: {
      alias: [
        { find: /^@readmint\/raster\/browser$/u, replacement: rasterBrowser },
        ...["data", "expr", "fonts", "format", "renderer"].map((name) => ({
          find: new RegExp(`^@readmint/${name}$`),
          replacement: source(name),
        })),
      ],
    },
    worker: { format: "es" },
    build: {
      write: false,
      assetsInlineLimit: 0,
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
const rasterWorker = (outputs: readonly Output[]) =>
  outputs.find((output) => output.fileName.includes("rasterWorker"));

const yamlMarker = /YAMLParseError|class Composer/u;
const rendererMarker = /function renderSvg\b/u;
const fontParserMarker = /function parseSfnt\b/u;
const imageSnifferMarker = /function sniffImage\b/u;
const rasterMarker = /function exportRaster\b|__wbindgen/u;

test("the initial chunk of the editor library leaves out the YAML parser", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/index.ts", import.meta.url)), false);
  expect(text(entry(outputs) ?? { type: "chunk", fileName: "" })).not.toMatch(yamlMarker);
  expect(outputs.filter((output) => yamlMarker.test(text(output)))).toHaveLength(1);
});

test("the app loads the YAML parser, the font parser and the image sniffer on demand and renders only in the workers", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/main.ts", import.meta.url)), false);
  const main = entry(outputs);
  const render = worker(outputs);
  expect(main).toBeDefined();
  expect(render).toBeDefined();
  if (main === undefined || render === undefined) return;
  for (const marker of [yamlMarker, rendererMarker, fontParserMarker, imageSnifferMarker]) {
    expect(text(main)).not.toMatch(marker);
  }
  expect(text(render)).toMatch(rendererMarker);
  // The raster worker renders every frame itself, so the renderer is in the two workers and nowhere else.
  expect(
    outputs.filter((output) => rendererMarker.test(text(output))).map((output) => output.fileName),
  ).toEqual([render.fileName, rasterWorker(outputs)?.fileName]);
  expect(outputs.some((output) => output !== render && fontParserMarker.test(text(output)))).toBe(
    true,
  );
  // The image upload's chunk takes the sniffer alone from the renderer, not the renderer with it.
  const sniffer = outputs.filter(
    (output) =>
      output.type === "chunk" &&
      output !== render &&
      output !== rasterWorker(outputs) &&
      imageSnifferMarker.test(text(output)),
  );
  expect(sniffer).toHaveLength(1);
  expect(text(sniffer[0] ?? main)).not.toMatch(rendererMarker);
});

test("the app stays within its gzip budgets: main chunk 120 kB, preview worker 250 kB", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/main.ts", import.meta.url)), true);
  const main = entry(outputs);
  const render = worker(outputs);
  if (main === undefined || render === undefined) throw new Error("app bundle is incomplete");
  expect(gzipBytes(main)).toBeLessThanOrEqual(120_000);
  expect(gzipBytes(render)).toBeLessThanOrEqual(250_000);
});

test("the raster code is only in its own worker chunk, never in the main chunk, the library or the preview worker", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/main.ts", import.meta.url)), false);
  const main = entry(outputs);
  const render = worker(outputs);
  const raster = rasterWorker(outputs);
  if (main === undefined || render === undefined || raster === undefined) {
    throw new Error("app bundle is incomplete");
  }
  expect(text(raster)).toMatch(rasterMarker);
  expect(text(main)).not.toMatch(rasterMarker);
  expect(text(render)).not.toMatch(rasterMarker);
  expect(
    outputs
      .filter((output) => output.fileName.endsWith(".js") && rasterMarker.test(text(output)))
      .map((output) => output.fileName),
  ).toEqual([raster.fileName]);
  // The main chunk only names the worker file; it never imports it.
  expect(text(main)).toContain(raster.fileName.replace(/^assets\//u, ""));
  const library = await bundle(fileURLToPath(new URL("../src/index.ts", import.meta.url)), false);
  expect(
    library.filter((output) => output.type === "chunk" && rasterMarker.test(text(output))),
  ).toEqual([]);
});

test("the WebAssembly modules are separate assets, never inlined into a chunk", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/main.ts", import.meta.url)), false);
  const modules = outputs.filter((output) => output.fileName.endsWith(".wasm"));
  expect(modules).toHaveLength(2);
  for (const module of modules) {
    expect(module.type).toBe("asset");
    expect(
      Buffer.from(module.source ?? "")
        .subarray(0, 4)
        .toString("hex"),
    ).toBe("0061736d");
  }
  expect(outputs.some((output) => output.type === "chunk" && /AGFzbQ/u.test(text(output)))).toBe(
    false,
  );
});

test("the raster worker stays within its gzip budget of 230 kB", async () => {
  const outputs = await bundle(fileURLToPath(new URL("../src/main.ts", import.meta.url)), true);
  const raster = rasterWorker(outputs);
  if (raster === undefined) throw new Error("app bundle is incomplete");
  expect(gzipBytes(raster)).toBeLessThanOrEqual(230_000);
});

test("the editor pins the WebAssembly packages to the versions the raster package pins", () => {
  const read = (path: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as {
      dependencies: Record<string, string>;
    };
  const editor = read("../package.json").dependencies;
  const raster = read("../../raster/package.json").dependencies;
  for (const name of ["@resvg/resvg-wasm", "wasm-webp"]) {
    expect(editor[name]).toBeDefined();
    expect(editor[name]).toBe(raster[name]);
  }
});
