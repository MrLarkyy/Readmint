import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { writeActionOutputs } from "../src/writeActionOutputs.js";
import { parseOutputs } from "./actionTree.js";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "readmint-output-"));
  file = join(dir, "output");
  await writeFile(file, "earlier=1\n");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const values = {
  changed: "true",
  commit: "abc",
  files: "readmint/a.svg\nreadmint/b.svg",
  snippet: "<picture>\n  <img>\n</picture>",
};

test("appends every output as a block; a multi-line value round-trips", async () => {
  await writeActionOutputs(file, values, (text) => text);
  const text = await readFile(file, "utf8");
  expect(text.startsWith("earlier=1\n")).toBe(true);
  expect(parseOutputs(text)).toEqual(values);
});

test("a delimiter found in a value is drawn again", async () => {
  const draws = ["aaaa", "bbbb"];
  await writeActionOutputs(
    file,
    { ...values, snippet: "x\nreadmint_aaaa\nforged<<y" },
    (text) => text,
    () => draws.shift() ?? "cccc",
  );
  const text = await readFile(file, "utf8");
  expect(text).toContain("snippet<<readmint_bbbb\nx\nreadmint_aaaa\nforged<<y\nreadmint_bbbb\n");
  expect(draws).toEqual([]);
});

test("values pass through the redaction", async () => {
  await writeActionOutputs(file, { ...values, files: "secret" }, (text) =>
    text.replaceAll("secret", "***"),
  );
  expect(parseOutputs(await readFile(file, "utf8")).files).toBe("***");
});
