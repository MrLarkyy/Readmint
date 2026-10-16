import { describe, expect, it } from "vitest";
import { anchors, linkTargets } from "./markdown.js";

describe("the anchor helpers the link tests rely on", () => {
  it("builds anchors like GitHub", () => {
    expect(anchors("## a_b\n## x\n## x\n## Why? (and how)")).toEqual(
      new Set(["a_b", "x", "x-1", "why-and-how"]),
    );
  });

  it("skips fenced code, including a short fence inside a longer one", () => {
    const text = "# in\n````md\n```\n# not a heading\n```\n# still code\n````\n## out";
    expect(anchors(text)).toEqual(new Set(["in", "out"]));
    expect(linkTargets("[a](a.md)\n```\n[b](b.md)\n```\n`[c](c.md)` [d](d.md)")).toEqual([
      "a.md",
      "d.md",
    ]);
  });
});
