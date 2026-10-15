import { expect, test } from "vitest";
import { assetSourceKind } from "../src/assetSourceKind.js";

test.each([
  ["data:image/png;base64,AAAA", "embedded"],
  // Malformed base64 is still embedded: the renderer reports it, there is no file to attach.
  ["data:font/ttf;base64,AAAAA", "embedded"],
  ["{{repo.logo}}", "bound"],
  ["{{}}", "bound"],
  ["{{x", "path"],
  ["logo.png", "path"],
  ["fonts/a.ttf", "path"],
])("%s is %s, as the CLI reads it", (src, kind) => {
  expect(assetSourceKind(src)).toBe(kind);
});
