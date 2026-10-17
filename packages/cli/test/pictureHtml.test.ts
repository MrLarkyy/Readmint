import { expect, test } from "vitest";
import { pictureHtml } from "../src/index.js";

test("builds a picture per entry from the names, in order", () => {
  expect(
    pictureHtml([
      { alt: "repo-3", light: "readmint/repo-3.svg", dark: "readmint/repo-3.dark.svg" },
      { alt: "header", light: "readmint/header.png", size: { width: 400, height: 90 } },
    ]),
  ).toBe(
    [
      "<picture>",
      '  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-3.dark.svg">',
      '  <img alt="repo-3" src="readmint/repo-3.svg">',
      "</picture>",
      "<picture>",
      '  <img alt="header" src="readmint/header.png" width="400" height="90">',
      "</picture>",
    ].join("\n"),
  );
});

test("encodes each path segment and escapes attribute values", () => {
  expect(pictureHtml([{ alt: "a\"<&>'", light: "my out/a b#.svg" }])).toBe(
    '<picture>\n  <img alt="a&quot;&lt;&amp;&gt;&#39;" src="my%20out/a%20b%23.svg">\n</picture>',
  );
});

test("no entry gives no HTML", () => {
  expect(pictureHtml([])).toBe("");
});
