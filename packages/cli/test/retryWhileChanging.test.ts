import { expect, test } from "vitest";
import { AssetPathError } from "../src/AssetPathError.js";
import { CliError } from "../src/CliError.js";
import { ExitCode } from "../src/ExitCode.js";
import { changedReadAttempts, retryWhileChanging } from "../src/retryWhileChanging.js";

const changed = () =>
  new CliError(ExitCode.input, 'design file "d.json" changed while it was being read', {
    cause: new AssetPathError("changed", "d.json"),
  });

function loader(failures: readonly Error[]): {
  load: () => Promise<string>;
  calls: () => number;
} {
  let calls = 0;
  return {
    load: () => {
      const failure = failures[calls++];
      return failure === undefined ? Promise.resolve("design") : Promise.reject(failure);
    },
    calls: () => calls,
  };
}

const pauses: number[] = [];
const pause = (ms: number) => {
  pauses.push(ms);
  return Promise.resolve();
};

test("a read that raced a save is read again and succeeds", async () => {
  pauses.length = 0;
  const { load, calls } = loader([changed(), new AssetPathError("changed", "logo.png")]);
  await expect(retryWhileChanging(load, pause)).resolves.toBe("design");
  expect(calls()).toBe(3);
  expect(pauses).toEqual([25, 50]);
});

test("after the last attempt the change is reported", async () => {
  const { load, calls } = loader(Array.from({ length: 10 }, changed));
  await expect(retryWhileChanging(load, pause)).rejects.toThrow("changed while it was being read");
  expect(calls()).toBe(changedReadAttempts);
});

test("any other failure is reported at once", async () => {
  const parse = new CliError(ExitCode.invalid, "d.json:1:2: error parse at /: unexpected end");
  const { load, calls } = loader([parse]);
  await expect(retryWhileChanging(load, pause)).rejects.toBe(parse);
  expect(calls()).toBe(1);
});
