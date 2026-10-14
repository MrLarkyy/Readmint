import { describe, expect, test } from "vitest";
import { type AssetPathErrorCode, checkAssetPath } from "../src/index.js";

const probes: Partial<Record<AssetPathErrorCode, string[]>> = {
  "trailing-dot-or-space": [
    "a/.. /b.png",
    "a/.../b.png",
    "NUL ",
    "a./b.png",
    "img.png.",
    "img.png ",
  ],
  "device-name": [
    "CON.png",
    "con.txt.png",
    "aux",
    "a/nul.png",
    "COM\u00b9.png",
    "lpt3.gif",
    "CONIN$.png",
    "CON .png",
    "Com0.webp",
    "prn.jpg",
    "conout$.png",
    "LPT\u00b2/x.png",
  ],
  absolute: [
    "/etc/passwd.png",
    "//server/share/x.png",
    "\\server\\share\\x.png",
    "C:/x.png",
    "c:x.png",
    "a:stream.png",
  ],
  "invalid-character": [
    "a\\b.png",
    "ab:stream.png",
    "img.png:stream",
    "a\u0000.png",
    "a\u001f.png",
    "a\u007f.png",
    "a*.png",
    "a?.png",
    'a".png',
    "a<.png",
    "a>.png",
    "a|b.png",
    "a\ud800.png",
    "a\udc00.png",
  ],
  "parent-segment": ["../x.png", "a/../../x.png", ".."],
  empty: [""],
  "too-long": [`${"a".repeat(1021)}.png`],
};

const valid = [
  "fonts/Inter-Regular.woff2",
  "a/b/c/d.png",
  "./img.png",
  "a//b.png",
  "console.png",
  "com10.png",
  ".hidden.png",
  "..foo.png",
  "na\u00efve/\u00fc.png",
  "CONSOLE/x.png",
  "emoji-\u{1f600}.png",
  `${"a".repeat(1020)}.png`,
];

describe("checkAssetPath", () => {
  for (const [code, sources] of Object.entries(probes)) {
    test.each(sources)(`%j is ${code}`, (src) => {
      expect(checkAssetPath(src)).toBe(code);
    });
  }

  test.each(valid)("%j is accepted", (src) => {
    expect(checkAssetPath(src)).toBeUndefined();
  });
});
