import { expect, test } from "vitest";
import { LaunchPath } from "../src/LaunchPath.js";

const token = "LaunchToken0123456789-_abcdefghijklmnopqrst";

test("the exact path is taken once, then never again", () => {
  const launch = new LaunchPath(token);
  expect(launch.take(`/${token}`)).toBe(true);
  expect(launch.take(`/${token}`)).toBe(false);
});

test("a discarded path is never taken", () => {
  const launch = new LaunchPath(token);
  launch.discard();
  expect(launch.take(`/${token}`)).toBe(false);
});

test.each([
  ["with a trailing slash", `/${token}/`],
  ["with one more character", `/${token}x`],
  ["without its last character", `/${token.slice(0, -1)}`],
  ["uppercased", `/${token.toUpperCase()}`],
  ["in a later segment", `/x/${token}`],
  ["with a percent-encoded first character", `/%4C${token.slice(1)}`],
  ["without its slash", token],
  ["empty", ""],
  ["the root", "/"],
])("the path %s is not taken and does not spend it", (_name, path) => {
  const launch = new LaunchPath(token);
  expect(launch.take(path)).toBe(false);
  expect(launch.take(`/${token}`)).toBe(true);
});

test("reuse is reported once, only after the path was taken", () => {
  const launch = new LaunchPath(token);
  expect(launch.reused(`/${token}`)).toBe(false);
  expect(launch.take(`/${token}`)).toBe(true);
  expect(launch.reused("/other")).toBe(false);
  expect(launch.reused(`/${token}/`)).toBe(false);
  expect(launch.reused(`/${token}`)).toBe(true);
  expect(launch.reused(`/${token}`)).toBe(false);
  expect(launch.take(`/${token}`)).toBe(false);
});

test("a discarded path never reports a reuse", () => {
  const launch = new LaunchPath(token);
  expect(launch.take(`/${token}`)).toBe(true);
  launch.discard();
  expect(launch.reused(`/${token}`)).toBe(false);
});
