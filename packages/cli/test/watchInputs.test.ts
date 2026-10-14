import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, expect, test } from "vitest";
import { watchInputs } from "../src/watchInputs.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
});

afterEach(async () => {
  await tree.remove();
});

test("runs once at the start, then once per change, also for a file that appears", async () => {
  const existing = await tree.file("a.txt", "1");
  const later = `${tree.root}/b.txt`;
  let calls = 0;
  const watcher = await watchInputs({
    paths: () => [existing, later],
    onChange: () => {
      calls += 1;
      return Promise.resolve();
    },
    intervalMs: 10,
  });
  expect(calls).toBe(1);
  await sleep(60);
  expect(calls).toBe(1);
  await tree.file("a.txt", "22");
  await waitFor(() => calls === 2);
  await tree.file("b.txt", "new");
  await waitFor(() => calls === 3);
  await watcher.close();
  await tree.file("a.txt", "333");
  await sleep(60);
  expect(calls).toBe(3);
});

test("a file still being written is not reported until it has been stable for a poll", async () => {
  const file = await tree.file("a.txt", "1");
  let calls = 0;
  const watcher = await watchInputs({
    paths: () => [file],
    onChange: () => {
      calls += 1;
      return Promise.resolve();
    },
    intervalMs: 30,
  });
  for (let size = 2; size < 30; size++) {
    await writeFile(file, "x".repeat(size));
    await sleep(5);
  }
  expect(calls).toBe(1);
  await waitFor(() => calls === 2);
  await sleep(100);
  expect(calls).toBe(2);
  await watcher.close();
});

test("a throwing onChange stops the polling and close rethrows it", async () => {
  const file = await tree.file("a.txt", "1");
  let calls = 0;
  const watcher = await watchInputs({
    paths: () => [file],
    onChange: () => {
      calls += 1;
      return calls === 2 ? Promise.reject(new Error("render broke")) : Promise.resolve();
    },
    intervalMs: 10,
  });
  await tree.file("a.txt", "22");
  await waitFor(() => calls === 2);
  await tree.file("a.txt", "333");
  await sleep(60);
  expect(calls).toBe(2);
  await expect(watcher.close()).rejects.toThrow("render broke");
});

async function waitFor(condition: () => boolean): Promise<void> {
  for (let tries = 0; !condition(); tries++) {
    if (tries > 500) throw new Error("timed out");
    await sleep(10);
  }
}
