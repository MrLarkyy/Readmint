import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

interface Chunk {
  readonly type: string;
  readonly fileName: string;
  readonly isEntry?: boolean;
  readonly code?: string;
}

const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve("vitest/package.json"));

async function bundle(entry: string): Promise<Chunk[]> {
  const { build } = (await import(vitestRequire.resolve("vite"))) as {
    build: (config: object) => Promise<{ output: Chunk[] }[] | { output: Chunk[] }>;
  };
  const format = fileURLToPath(new URL("../../format/src/index.ts", import.meta.url));
  const result = await build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { "@readmint/format": format } },
    build: {
      write: false,
      minify: false,
      lib: false,
      rollupOptions: { input: entry, output: { format: "es" }, preserveEntrySignatures: "strict" },
    },
  });
  return (Array.isArray(result) ? result : [result]).flatMap((one) => one.output);
}

const marker = /YAMLParseError|class Composer/u;

test("the initial chunk of the editor leaves out the YAML parser", async () => {
  const chunks = (await bundle(fileURLToPath(new URL("../src/index.ts", import.meta.url)))).filter(
    (chunk) => chunk.type === "chunk",
  );
  const entry = chunks.find((chunk) => chunk.isEntry === true);
  expect(entry?.code).toBeDefined();
  expect(entry?.code).not.toMatch(marker);
  expect(
    chunks.filter((chunk) => chunk.code !== undefined && marker.test(chunk.code)),
  ).toHaveLength(1);
});
