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

test("a comment end inside a licence text cannot close the banner", async () => {
  const odd = join(dir, "node_modules", "odd");
  await mkdir(odd, { recursive: true });
  await writeFile(join(odd, "package.json"), JSON.stringify({ name: "odd", version: "1.0.0" }));
  await writeFile(join(odd, "LICENSE"), "MIT */ alert(1)");
  const banner = licenceBanner([join(odd, "index.js")]);
  expect(banner.indexOf("*/")).toBe(banner.length - 2);
});

test("a package gets the licence texts this repository supplies after its own", async () => {
  const resvg = join(dir, "node_modules", "@resvg", "resvg-wasm");
  await mkdir(resvg, { recursive: true });
  await writeFile(
    join(resvg, "package.json"),
    JSON.stringify({ name: "@resvg/resvg-wasm", version: "2.6.2", license: "MPL-2.0" }),
  );
  const banner = licenceBanner([join(resvg, "index.mjs")]);
  expect(banner).toContain(" * Package: @resvg/resvg-wasm@2.6.2 (MPL-2.0)");
  expect(banner).toContain(" * Mozilla Public License Version 2.0");
  expect(banner).toContain(" * Rust crates compiled into @resvg/resvg-wasm 2.6.2");
  expect(banner).toMatch(/ * tiny-skia +0.10.0 +BSD-3-Clause/);
});

test("libwebp's notice follows wasm-webp's own licence", async () => {
  const webp = join(dir, "node_modules", "wasm-webp");
  await mkdir(webp, { recursive: true });
  await writeFile(
    join(webp, "package.json"),
    JSON.stringify({ name: "wasm-webp", version: "0.1.0", license: "MIT" }),
  );
  await writeFile(join(webp, "LICENSE"), "MIT text of wasm-webp");
  const banner = licenceBanner([join(webp, "dist", "esm", "webp-wasm.js")]);
  expect(banner.indexOf(" * MIT text of wasm-webp")).toBeLessThan(
    banner.indexOf(" * Copyright (c) 2010, Google Inc. All rights reserved."),
  );
  expect(banner).toContain(" * Additional IP Rights Grant (Patents)");
});

test("the resvg crate list gives every crate a version and real notices, no template placeholders", () => {
  const list = readFileSync(
    join(import.meta.dirname, "..", "scripts", "licences", "resvg-wasm-crates.txt"),
    "utf8",
  );
  const table = list.slice(0, list.indexOf("\n----- ")).split("\n\n").at(-1) ?? "";
  const rows = table.split("\n").filter((line) => line.trim() !== "");
  expect(rows.length).toBeGreaterThan(60);
  for (const row of rows) expect(row, row).toMatch(/^[A-Za-z0-9_-]+ +\d+\.\d+\.\d+\S* /);
  // The how-to-apply appendix of the Apache License is part of its verbatim text and holds a template on purpose.
  const notices = list.replace(
    /APPENDIX: How to apply the Apache License to your work\.[\s\S]*?limitations under the License\./g,
    "",
  );
  for (const placeholder of [
    "<year>",
    "<copyright holders>",
    "<owner>",
    "[yyyy]",
    "[name of copyright owner]",
  ]) {
    expect(notices, placeholder).not.toContain(placeholder);
  }
});

test("every crate the resvg binary names, the standard library included, is a row of the list", () => {
  const list = readFileSync(
    join(import.meta.dirname, "..", "scripts", "licences", "resvg-wasm-crates.txt"),
    "utf8",
  );
  const rows = new Set(
    (list.slice(0, list.indexOf("\n----- ")).split("\n\n").at(-1) ?? "")
      .split("\n")
      .map((line) => line.split(" ")[0]),
  );
  const raster = createRequire(join(import.meta.dirname, "..", "..", "raster", "package.json"));
  const wasm = readFileSync(raster.resolve("@resvg/resvg-wasm/index_bg.wasm")).toString("latin1");
  const named = new Set([
    ...[...wasm.matchAll(/registry\/src\/[^/]+\/([A-Za-z0-9_-]+?)-\d+\.\d+\.\d+/g)].map(
      (m) => m[1],
    ),
    ...[...wasm.matchAll(/\/rust\/deps\/([A-Za-z0-9_-]+?)-\d+\.\d+\.\d+/g)].map((m) => m[1]),
    ...[...wasm.matchAll(/\/rustc\/[0-9a-f]{40}\/library\/([A-Za-z0-9_-]+)\//g)].map((m) => m[1]),
  ]);
  expect(named.size).toBeGreaterThanOrEqual(40);
  for (const name of named) expect(rows.has(name), name).toBe(true);
});

test("std_detect carries the stdarch licence with its copyright line, not rust-lang/rust's", () => {
  const list = readFileSync(
    join(import.meta.dirname, "..", "scripts", "licences", "resvg-wasm-crates.txt"),
    "utf8",
  );
  const heading = /^----- [^\n]*std_detect [^\n]*crates\/std_detect\/LICENSE-MIT\) -----$/m.exec(
    list,
  );
  expect(heading).not.toBeNull();
  const text = list.slice((heading?.index ?? 0) + (heading?.[0].length ?? 0)).trimStart();
  expect(text.startsWith("Copyright (c) 2017 The Rust Project Developers")).toBe(true);
});
