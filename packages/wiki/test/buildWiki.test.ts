import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildWiki,
  extractWorkflow,
  rewriteLinks,
  wikiPages,
  type WikiPage,
} from "../src/index.js";

const docsDir = fileURLToPath(new URL("../../../docs/", import.meta.url));
const options = { repository: "https://example.test/o/r", branch: "main" };

function readDocs(): Map<string, string> {
  return new Map(
    readdirSync(docsDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => [name, readFileSync(docsDir + name, "utf8")]),
  );
}

function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

function anchors(markdown: string): Set<string> {
  const found = new Set<string>();
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced ? /^#{1,6}\s+(.*)$/.exec(line)?.[1] : undefined;
    if (heading !== undefined) found.add(slug(heading));
  }
  return found;
}

describe("buildWiki", () => {
  const docs = readDocs();
  const wiki = buildWiki(docs, options);

  it("is deterministic", () => {
    expect([...buildWiki(readDocs(), options)]).toEqual([...wiki]);
  });

  it("publishes the user guide and keeps contributor documentation out", () => {
    expect([...wiki.keys()].sort()).toEqual(
      ["Home.md", "_Sidebar.md", ...wikiPages.map((page) => `${page.name}.md`)].sort(),
    );
    expect(wiki.has("golden-tests.md")).toBe(false);
    for (const page of wikiPages) expect(docs.has(page.source)).toBe(true);
    // Every docs/ file is either a wiki page or deliberately contributor-only.
    const published = new Set(wikiPages.map((page) => page.source));
    expect([...docs.keys()].filter((file) => !published.has(file))).toEqual([
      "golden-tests.md",
      "wiki-publishing.md",
    ]);
  });

  it("marks every page as generated and names its source", () => {
    for (const page of wikiPages) {
      expect(wiki.get(`${page.name}.md`)).toContain(
        `docs/${page.source}](${options.repository}/blob/main/docs/${page.source})`,
      );
      expect(wiki.get(`${page.name}.md`)).toContain("Edit it there");
    }
    expect(wiki.get("Home.md")).toContain("Generated from the `docs/` folder");
  });

  it("resolves every internal link to a page and an anchor that exist", () => {
    const names = new Map(wikiPages.map((page) => [page.name, wiki.get(`${page.name}.md`) ?? ""]));
    names.set("Home", wiki.get("Home.md") ?? "");
    for (const [file, text] of wiki) {
      const own = anchors(text);
      for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1] ?? "";
        if (/^https?:/.test(target)) {
          // The examples repository is the one other repository the docs link to.
          expect(target, `${file} links to a repository file`).toMatch(
            /^(https:\/\/example\.test\/o\/r\/|https:\/\/github\.com\/MrLarkyy\/readmint-template-test$)/,
          );
          continue;
        }
        const [name = "", anchor] = target.split("#");
        const page = name === "" ? text : names.get(name);
        expect(page, `${file}: ${target}`).toBeDefined();
        if (anchor !== undefined) {
          expect((name === "" ? own : anchors(page ?? "")).has(anchor), `${file}: ${target}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("puts the workflow of docs/action.md into the Home page and the Action page", () => {
    const workflow = extractWorkflow(docs.get("action.md") ?? "");
    expect(workflow).toContain("uses: MrLarkyy/Readmint@vX.Y.Z");
    expect(wiki.get("Home.md")).toContain(workflow);
    expect(wiki.get("GitHub-Action.md")).toContain(workflow);
  });

  it("lists every page in the sidebar", () => {
    const sidebar = wiki.get("_Sidebar.md") ?? "";
    for (const page of wikiPages) expect(sidebar).toContain(`](${page.name})`);
  });

  it("fails on a missing source", () => {
    const partial = new Map(docs);
    partial.delete("cli.md");
    expect(() => buildWiki(partial, options)).toThrow("docs/cli.md is missing");
  });
});

describe("rewriteLinks", () => {
  const pages: readonly WikiPage[] = [{ source: "a.md", name: "Page-A", summary: "" }];
  const url = "https://example.test/o/r/blob/main/docs";

  it("rewrites published links, keeps anchors and absolute links", () => {
    expect(rewriteLinks("[x](a.md#top) [y](#here) [z](https://e.test/a.md)", pages, url)).toBe(
      "[x](Page-A#top) [y](#here) [z](https://e.test/a.md)",
    );
  });

  it("points other files at the repository", () => {
    expect(rewriteLinks("[g](golden-tests.md#run) [p](../packages/x/README.md)", pages, url)).toBe(
      `[g](${url}/golden-tests.md#run) [p](https://example.test/o/r/blob/main/packages/x/README.md)`,
    );
  });

  it("leaves code alone", () => {
    const code = "`[x](a.md)`\n```md\n[x](a.md)\n```\n~~~\n[x](a.md)\n~~~";
    expect(rewriteLinks(code, pages, url)).toBe(code);
  });
});
