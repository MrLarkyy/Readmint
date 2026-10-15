import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { licenceBanner } from "../scripts/licenceBanner.js";

const yamlEntry = createRequire(import.meta.url).resolve("yaml");
const yamlRoot = join(dirname(yamlEntry), "..");
const yamlVersion = (
  JSON.parse(readFileSync(join(yamlRoot, "package.json"), "utf8")) as {
    version: string;
  }
).version;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "readmint-licence-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("names each bundled npm package once, with its full licence text", () => {
  const banner = licenceBanner([yamlEntry, join(yamlRoot, "dist", "visit.js"), "\0virtual"]);
  expect(banner.startsWith("/*!\n")).toBe(true);
  expect(banner.endsWith("\n */")).toBe(true);
  expect(banner.match(/Package: /g)).toHaveLength(1);
  expect(banner).toContain(` * Package: yaml@${yamlVersion} (ISC)`);
  const licence = readFileSync(join(yamlRoot, "LICENSE"), "utf8").trim().split(/\r?\n/);
  for (const line of licence) expect(banner).toContain(line.trimEnd());
});

test("workspace packages and files outside node_modules are left out", async () => {
  const own = join(dir, "node_modules", "@readmint", "cli");
  await mkdir(own, { recursive: true });
  await writeFile(join(own, "package.json"), JSON.stringify({ name: "@readmint/cli" }));
  expect(licenceBanner([join(own, "index.js"), join(dir, "src", "main.js")])).not.toContain(
    "Package:",
  );
});

test("a package without a licence file fails the build", async () => {
  const bare = join(dir, "node_modules", "bare");
  await mkdir(bare, { recursive: true });
  await writeFile(join(bare, "package.json"), JSON.stringify({ name: "bare", version: "1.0.0" }));
  expect(() => licenceBanner([join(bare, "index.js")])).toThrow("bare ships no licence file");
});

test("a package without a licence file takes the text supplied for it in the repository", async () => {
  const bare = join(dir, "node_modules", "bare");
  const supplied = join(dir, "licences");
  await mkdir(bare, { recursive: true });
  await mkdir(supplied, { recursive: true });
  await writeFile(join(bare, "package.json"), JSON.stringify({ name: "bare", version: "1.0.0" }));
  await writeFile(join(supplied, "bare.txt"), "Supplied MIT text");
  const banner = licenceBanner([join(bare, "index.js")], supplied);
  expect(banner).toContain(" * Package: bare@1.0.0 (see below)");
  expect(banner).toContain(" * Supplied MIT text");
  expect(() => licenceBanner([join(bare, "index.js")], join(dir, "elsewhere"))).toThrow(
    "bare ships no licence file",
  );
});

test("brotli, which ships none, has its MIT and Apache-2.0 texts supplied", () => {
  const text = readFileSync(
    join(import.meta.dirname, "..", "scripts", "licences", "brotli.txt"),
    "utf8",
  );
  expect(text).toContain("MIT License");
  expect(text).toContain("Copyright 2013 Google Inc.");
  expect(text).toContain("Apache License\n                           Version 2.0, January 2004");
  expect(text).toContain("END OF TERMS AND CONDITIONS");
});

test("the brotli text names, for each bundled file, the notice the file itself carries", () => {
  const text = readFileSync(
    join(import.meta.dirname, "..", "scripts", "licences", "brotli.txt"),
    "utf8",
  );
  const fontsRequire = createRequire(
    join(import.meta.dirname, "..", "..", "fonts", "package.json"),
  );
  const root = dirname(fontsRequire.resolve("brotli/decompress.js"));
  const google = "Copyright 2013 Google Inc. All Rights Reserved.";
  const plain = [
    "decompress.js",
    "dec/streams.js",
    "dec/huffman.js",
    "dec/dictionary-browser.js",
    "dec/dictionary.bin.js",
  ];
  const apache = [
    "dec/decode.js",
    "dec/bit_reader.js",
    "dec/context.js",
    "dec/dictionary.js",
    "dec/prefix.js",
    "dec/transform.js",
  ];
  const flat = text.replace(/\s+/gu, " ");
  for (const file of [...plain, ...apache]) expect(flat).toContain(file);
  for (const file of plain) expect(readFileSync(join(root, file), "utf8")).not.toContain(google);
  for (const file of apache)
    expect(readFileSync(join(root, file), "utf8").slice(0, 200)).toContain(google);
});

test("a comment end inside a licence text cannot close the banner", async () => {
  const odd = join(dir, "node_modules", "odd");
  await mkdir(odd, { recursive: true });
  await writeFile(join(odd, "package.json"), JSON.stringify({ name: "odd", version: "1.0.0" }));
  await writeFile(join(odd, "LICENSE"), "MIT */ alert(1)");
  const banner = licenceBanner([join(odd, "index.js")]);
  expect(banner.indexOf("*/")).toBe(banner.length - 2);
});
