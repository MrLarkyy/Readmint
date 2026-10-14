import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { pictureSnippet } from "../src/pictureSnippet.js";

describe("pictureSnippet", () => {
  test("a design without a twin is a picture with an img only", () => {
    expect(
      pictureSnippet([
        { stem: "card", light: { design: "card.json", output: "readmint/card.svg" } },
      ]),
    ).toBe('<picture>\n  <img alt="card" src="readmint/card.svg">\n</picture>');
  });

  test("a design with a twin adds the dark source, designs stay in order", () => {
    const snippet = pictureSnippet([
      {
        stem: "stats",
        light: { design: "stats.yaml", output: "out/stats.svg" },
        dark: { design: "stats.dark.yaml", output: "out/stats.dark.svg" },
      },
      { stem: "card", light: { design: "card.json", output: "out/card.svg" } },
    ]);
    expect(snippet).toBe(
      [
        "<picture>",
        '  <source media="(prefers-color-scheme: dark)" srcset="out/stats.dark.svg">',
        '  <img alt="stats" src="out/stats.svg">',
        "</picture>",
        "<picture>",
        '  <img alt="card" src="out/card.svg">',
        "</picture>",
      ].join("\n"),
    );
  });

  test("paths are percent-encoded per segment and attributes HTML-escaped", () => {
    const stem = `a "b" <c> & d's ü`;
    const snippet = pictureSnippet([
      {
        stem,
        light: { design: `${stem}.json`, output: `my out/${stem}.svg` },
        dark: { design: `${stem}.dark.json`, output: `my out/${stem}.dark.svg` },
      },
    ]);
    const encoded = "a%20%22b%22%20%3Cc%3E%20%26%20d's%20%C3%BC";
    expect(snippet).toContain(`srcset="my%20out/${encoded.replace("'", "&#39;")}.dark.svg"`);
    expect(snippet).toContain(
      `<img alt="a &quot;b&quot; &lt;c&gt; &amp; d&#39;s ü" src="my%20out/${encoded.replace("'", "&#39;")}.svg">`,
    );
    expect(snippet.match(/"/g)?.length).toBe(8);
  });
});

test("docs/action.md shows the snippet exactly as the Action prints it", () => {
  const docs = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "docs", "action.md"),
    "utf8",
  );
  const fence = /```html\n([^`]*)```/.exec(docs)?.[1]?.trimEnd();
  expect(fence).toBe(
    pictureSnippet([
      {
        stem: "card",
        light: { design: "card.yaml", output: "readmint/card.svg" },
        dark: { design: "card.dark.yaml", output: "readmint/card.dark.svg" },
      },
    ]),
  );
});
