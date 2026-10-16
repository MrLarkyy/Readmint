import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CliError, ExitCode, loadFixtureData } from "../src/index.js";

let base: string;
let root: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "readmint-fixture-"));
  root = join(base, "work");
  await mkdir(join(root, "fixtures"), { recursive: true });
  await writeFile(join(root, "fixtures", "data.json"), '{"stats":{"v":1}}');
  await writeFile(join(base, "outside.json"), '{"secret":{"v":9}}');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function failure(promise: Promise<unknown>): Promise<CliError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CliError) return error;
    throw error;
  }
  throw new Error("loadFixtureData accepted the file");
}

describe("loadFixtureData", () => {
  test("unconfined (CLI --data) reads a parent-relative and an absolute path", async () => {
    expect(await loadFixtureData("../outside.json", root)).toEqual({ secret: { v: 9 } });
    expect(await loadFixtureData(join(base, "outside.json"), root)).toEqual({ secret: { v: 9 } });
  });

  test("confined reads a file inside, with either separator", async () => {
    const options = { confinedTo: root };
    expect(await loadFixtureData("fixtures/data.json", root, options)).toEqual({ stats: { v: 1 } });
    expect(await loadFixtureData("fixtures\\data.json", root, options)).toEqual({
      stats: { v: 1 },
    });
  });

  test.each([
    ["../outside.json"],
    ["fixtures/../../outside.json"],
    ["/outside.json"],
    ["C:\\x.json"],
  ])(
    "confined refuses %s with the input exit code, never the root or the content",
    async (path) => {
      const error = await failure(loadFixtureData(path, root, { confinedTo: root }));
      expect(error.exitCode).toBe(ExitCode.input);
      expect(error.message).toContain("fixture data");
      expect(error.message).not.toContain(root);
      expect(error.message).not.toContain("secret");
    },
  );

  test("confined refuses an absolute path to an existing outside file", async () => {
    const error = await failure(
      loadFixtureData(join(base, "outside.json"), root, { confinedTo: root }),
    );
    expect(error.message).not.toContain("secret");
  });

  test("confined refuses a link to the outside and a directory", async (context) => {
    try {
      await symlink(base, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        context.skip();
        return;
      }
      throw error;
    }
    const link = await failure(loadFixtureData("escape/outside.json", root, { confinedTo: root }));
    expect(link.message).toContain("outside");
    expect(link.message).not.toContain("secret");
    const directory = await failure(loadFixtureData("fixtures", root, { confinedTo: root }));
    expect(directory.message).toContain("not a regular file");
  });

  test("confined keeps the namespace check", async () => {
    await writeFile(join(root, "bad.json"), '{"Bad":1}');
    const error = await failure(loadFixtureData("bad.json", root, { confinedTo: root }));
    expect(error.message).toContain("not a data namespace");
  });
});
