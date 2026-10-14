import { expect, test } from "vitest";
import { type SettleState, settleSnapshot } from "../src/settleSnapshot.js";

const stats = (file: string, mtime: number, size: number) =>
  `${file}\0${String(mtime)}:${String(size)}:7`;
const missing = (file: string) => `${file}\0ENOENT`;

const a1 = stats("a", 1, 1);
const a2 = stats("a", 2, 2);
const a3 = stats("a", 3, 3);

test.each<[string, SettleState, string, SettleState, boolean]>([
  [
    "nothing changed",
    { last: a1, pending: undefined },
    a1,
    { last: a1, pending: undefined },
    false,
  ],
  [
    "a change seen once is held",
    { last: a1, pending: undefined },
    a2,
    { last: a1, pending: a2 },
    false,
  ],
  [
    "a change that reads the same again fires",
    { last: a1, pending: a2 },
    a2,
    { last: a2, pending: undefined },
    true,
  ],
  [
    "a file that keeps changing is held again",
    { last: a1, pending: a2 },
    a3,
    { last: a1, pending: a3 },
    false,
  ],
  [
    "a change reverted before the next poll is dropped",
    { last: a1, pending: a2 },
    a1,
    { last: a1, pending: undefined },
    false,
  ],
  [
    "a file that appears is held",
    { last: missing("a"), pending: undefined },
    a1,
    { last: missing("a"), pending: a1 },
    false,
  ],
  [
    "a file that appeared and stayed fires",
    { last: missing("a"), pending: a1 },
    a1,
    { last: a1, pending: undefined },
    true,
  ],
  [
    "a file that disappears is held",
    { last: a1, pending: undefined },
    missing("a"),
    { last: a1, pending: missing("a") },
    false,
  ],
  [
    "a file that stayed gone fires",
    { last: a1, pending: missing("a") },
    missing("a"),
    { last: missing("a"), pending: undefined },
    true,
  ],
  [
    "a file that comes back before the next poll is dropped",
    { last: a1, pending: missing("a") },
    a1,
    { last: a1, pending: undefined },
    false,
  ],
])("%s", (_, state, current, next, fire) => {
  expect(settleSnapshot(state, current)).toEqual({ state: next, fire });
});
