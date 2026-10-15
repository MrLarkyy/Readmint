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

test("a package that publishes no licence file gets the text this repository supplies", async () => {
  const resvg = join(dir, "node_modules", "@resvg", "resvg-wasm");
  await mkdir(resvg, { recursive: true });
  await writeFile(
    join(resvg, "package.json"),
    JSON.stringify({ name: "@resvg/resvg-wasm", version: "2.6.2", license: "MPL-2.0" }),
  );
  const banner = licenceBanner([join(resvg, "index.mjs")]);
  expect(banner).toContain(" * Package: @resvg/resvg-wasm@2.6.2 (MPL-2.0)");
  expect(banner).toContain(" * Mozilla Public License Version 2.0");
});

test("a licence a package keeps in a subfolder is bundled too", async () => {
  const webp = join(dir, "node_modules", "@jsquash", "webp");
  await mkdir(join(webp, "codec"), { recursive: true });
  await writeFile(
    join(webp, "package.json"),
    JSON.stringify({ name: "@jsquash/webp", version: "1.5.0", license: "Apache-2.0" }),
  );
  await writeFile(join(webp, "LICENSE"), "Apache text");
  await writeFile(join(webp, "codec", "LICENSE.codec.md"), "libwebp BSD text");
  const banner = licenceBanner([join(webp, "codec", "enc", "webp_enc_simd.js")]);
  expect(banner).toContain(" * Apache text");
  expect(banner).toContain(" * libwebp BSD text");
});
