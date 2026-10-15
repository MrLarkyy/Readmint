import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FILE_CACHE_MAX_ENTRY_BYTES, FileCache } from "../../src/node/index.js";

describe("FileCache", () => {
  let directory: string;
  let now = 5_000_000;
  const key = "a".repeat(64);

  beforeEach(async () => {
    directory = join(await mkdtemp(join(tmpdir(), "readmint-cache-")), "nested");
    now = 5_000_000;
  });

  afterEach(async () => {
    await rm(join(directory, ".."), { recursive: true, force: true });
  });

  const fileCache = () => new FileCache({ directory, now: () => now });

  test("round-trips an entry and leaves no temporary file", async () => {
    await fileCache().set(key, "value", 60);
    expect(await fileCache().get(key)).toBe("value");
    expect(await readdir(directory)).toEqual([`${key}.json`]);
  });

  test.skipIf(process.platform === "win32")("writes owner-only files", async () => {
    await fileCache().set(key, "value", 60);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(directory, `${key}.json`))).mode & 0o777).toBe(0o600);
  });

  test("an expired entry is a miss", async () => {
    await fileCache().set(key, "value", 60);
    now += 60_000;
    expect(await fileCache().get(key)).toBeUndefined();
  });

  test("a corrupt or malformed file is a miss", async () => {
    await fileCache().set(key, "value", 60);
    const path = join(directory, `${key}.json`);
    for (const content of [
      "{not json",
      "null",
      JSON.stringify({ storedAt: now, ttlSeconds: 60, value: 5 }),
    ]) {
      await writeFile(path, content);
      expect(await fileCache().get(key)).toBeUndefined();
    }
  });

  test("an oversized file is a miss", async () => {
    await fileCache().set(key, "value", 60);
    await writeFile(join(directory, `${key}.json`), Buffer.alloc(FILE_CACHE_MAX_ENTRY_BYTES + 1));
    expect(await fileCache().get(key)).toBeUndefined();
  });

  test("a missing entry or a key that is not a digest is a miss, and set refuses it", async () => {
    expect(await fileCache().get(key)).toBeUndefined();
    expect(await fileCache().get("../escape")).toBeUndefined();
    await expect(fileCache().set("../escape", "value", 60)).rejects.toThrow(TypeError);
  });
});
