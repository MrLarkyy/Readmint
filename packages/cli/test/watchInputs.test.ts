import { readFile, rm, writeFile } from "node:fs/promises";
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

test("runs once at the start, then once per settled change, also for a file that appears", async () => {
  const existing = await tree.file("a.txt", "1");
  const later = `${tree.root}/b.txt`;
  const polls = manualPolls();
  let calls = 0;
  const watcher = await watchInputs({
    paths: () => [existing, later],
    onChange: count,
    nextPoll: polls.nextPoll,
  });
  expect(calls).toBe(1);
  await polls.poll();
  await polls.poll();
  expect(calls).toBe(1);
  await tree.file("a.txt", "22");
  await polls.poll();
  expect(calls).toBe(1);
  await polls.poll();
  expect(calls).toBe(2);
  await tree.file("b.txt", "new");
  await polls.poll();
  await polls.poll();
  expect(calls).toBe(3);
  await polls.poll();
  expect(calls).toBe(3);
  await watcher.close();
  expect(polls.waiting()).toBe(false);

  function count() {
    calls += 1;
    return Promise.resolve();
  }
});

test("a file that changes on every poll is reported only once it reads the same on two polls", async () => {
  const file = await tree.file("a.txt", "1");
  const polls = manualPolls();
  const seen: string[] = [];
  const watcher = await watchInputs({
    paths: () => [file],
    onChange: async () => {
      seen.push(await readFile(file, "utf8"));
    },
    nextPoll: polls.nextPoll,
  });
  for (let size = 2; size <= 10; size++) {
    await writeFile(file, "x".repeat(size));
    await polls.poll();
  }
  expect(seen).toEqual(["1"]);
  await polls.poll();
  expect(seen).toEqual(["1", "x".repeat(10)]);
  await polls.poll();
  expect(seen).toHaveLength(2);
  await watcher.close();
});

test("a file that disappears is reported once it stays gone", async () => {
  const file = await tree.file("a.txt", "1");
  const polls = manualPolls();
  let calls = 0;
  const watcher = await watchInputs({
    paths: () => [file],
    onChange: () => {
      calls += 1;
      return Promise.resolve();
    },
    nextPoll: polls.nextPoll,
  });
  await rm(file);
  await polls.poll();
  expect(calls).toBe(1);
  await polls.poll();
  expect(calls).toBe(2);
  await watcher.close();
});

test("a throwing onChange stops the polling and close rethrows it", async () => {
  const file = await tree.file("a.txt", "1");
  const polls = manualPolls();
  let calls = 0;
  const watcher = await watchInputs({
    paths: () => [file],
    onChange: () => {
      calls += 1;
      return calls === 2 ? Promise.reject(new Error("render broke")) : Promise.resolve();
    },
    nextPoll: polls.nextPoll,
  });
  await tree.file("a.txt", "22");
  await polls.poll();
  await polls.release();
  await waitFor(() => calls === 2);
  await expect(watcher.close()).rejects.toThrow("render broke");
  expect(polls.waiting()).toBe(false);
  expect(calls).toBe(2);
});

test("the real poll timer: a change is reported", async () => {
  const file = await tree.file("a.txt", "1");
  let calls = 0;
  const watcher = await watchInputs({
    paths: () => [file],
    onChange: () => {
      calls += 1;
      return Promise.resolve();
    },
    nextPoll: (signal) => sleep(10, undefined, { signal }),
  });
  await tree.file("a.txt", "22");
  await waitFor(() => calls >= 2);
  await watcher.close();
});

interface ManualPolls {
  readonly nextPoll: (signal: AbortSignal) => Promise<void>;
  /** Lets the watcher run one poll, and resolves once it waits for the next. */
  poll(): Promise<void>;
  /** Lets the watcher run one poll without waiting for it to finish. */
  release(): Promise<void>;
  /** The watcher is waiting for a poll. */
  waiting(): boolean;
}

/** A poll trigger the test drives, so the outcome does not depend on how loaded the machine is. */
function manualPolls(): ManualPolls {
  let due: (() => void) | undefined;
  let onWait: (() => void) | undefined;
  const nextWait = () =>
    new Promise<void>((resolve) => {
      if (due === undefined) onWait = resolve;
      else resolve();
    });
  const release = async () => {
    await nextWait();
    const run = due;
    due = undefined;
    run?.();
  };
  return {
    nextPoll: (signal) =>
      new Promise<void>((resolve, reject) => {
        const stop = () => {
          due = undefined;
          reject(new Error("closed"));
        };
        if (signal.aborted) {
          stop();
          return;
        }
        signal.addEventListener("abort", stop, { once: true });
        due = resolve;
        const waiter = onWait;
        onWait = undefined;
        waiter?.();
      }),
    async poll() {
      await release();
      await nextWait();
    },
    release,
    waiting: () => due !== undefined,
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let tries = 0; !condition(); tries++) {
    if (tries > 500) throw new Error("timed out");
    await sleep(10);
  }
}
