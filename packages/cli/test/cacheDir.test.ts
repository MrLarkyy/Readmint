import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { authoredFetch } from "./authoredFetch.js";
import { boundDesign, type CliTree, makeCliTree, png } from "./cliTree.js";
import { CANARY, secretForms } from "./githubFetch.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound/design.json", boundDesign("{{ github.following }}"));
  await tree.file("bound/logo.png", png);
});
afterEach(() => tree.remove());

const render = (cap: string, replay: ReturnType<typeof authoredFetch>) =>
  tree.run(
    [
      "render",
      "bound/design.json",
      "--github",
      "--language-commit-cap",
      cap,
      "--cache-dir",
      "cache",
    ],
    { env: { GH_TOKEN: CANARY }, fetch: replay.fetch },
  );

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("render --github --cache-dir", () => {
  test("a second run sends no request, a raised cap reads only the commits not read before", async () => {
    const first = authoredFetch();
    const one = await render("3", first);
    expect(one.code).toBe(ExitCode.ok);
    expect(first.rest()).toHaveLength(3);

    const second = authoredFetch();
    const two = await render("3", second);
    expect(second.rest()).toEqual([]);
    expect(second.urls.length).toBeLessThanOrEqual(1);
    expect(two.stdout).toBe(one.stdout);

    const third = authoredFetch();
    const three = await render("5", third);
    expect(three.code).toBe(ExitCode.ok);
    expect(third.rest()).toHaveLength(2);
  });

  test("no cache file name or content, and no output, holds the token", async () => {
    const replay = authoredFetch();
    const run = await render("3", replay);
    await render("5", authoredFetch());
    const found = await files(join(tree.root, "cache"));
    expect(found.length).toBeGreaterThan(3);
    const texts = [run.stderr, ...found];
    for (const file of found) texts.push((await readFile(file)).toString("latin1"));
    for (const form of secretForms(CANARY)) {
      for (const text of texts) expect(text).not.toContain(form);
    }
  });

  test("a cache path that is a file exits with 3 before any request", async () => {
    await writeFile(join(tree.root, "cache"), "x");
    const replay = authoredFetch();
    const run = await render("3", replay);
    expect(run.code).toBe(ExitCode.input);
    expect(run.stderr).toContain("is not a folder");
    expect(replay.urls).toEqual([]);
  });
});
