import { expect, test } from "vitest";
import { redactSecrets } from "../src/index.js";

const base64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

test("replaces the secret, its base64 form and the base64 of the x-access-token credential", () => {
  const secret = "ghp_abcdefSECRET123";
  const text = `a ${secret} b ${base64(secret)} c ${base64(`x-access-token:${secret}`)} d`;
  expect(redactSecrets(text, [secret])).toBe("a *** b *** c *** d");
});

test("every secret of the list, every occurrence", () => {
  expect(redactSecrets("one two one", ["one1", "one", "two2"])).toBe("one two one");
  expect(redactSecrets("abcd wxyz abcd", ["abcd", "wxyz"])).toBe("*** *** ***");
});

test("ignores secrets shorter than 4 characters", () => {
  expect(redactSecrets("a abc ab", ["", "a", "abc"])).toBe("a abc ab");
});
