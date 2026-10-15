import { expect, test } from "vitest";
import { previewSecret } from "../src/previewSecret.js";

test("a preview secret is 43 base64url characters (256 bits)", () => {
  expect(previewSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test("every preview secret is new", () => {
  const secrets = new Set(Array.from({ length: 100 }, () => previewSecret()));
  expect(secrets.size).toBe(100);
});
