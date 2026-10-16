import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildWiki,
  examplesRepository,
  extractWorkflow,
  rewriteLinks,
  wikiGroups,
  wikiPages,
  type WikiPage,
} from "../src/index.js";
import { anchors } from "./markdown.js";

const docsDir = fileURLToPath(new URL("../../../docs/", import.meta.url));
const options = { repository: "https://example.test/o/r", branch: "main" };

function readDocs(): Map<string, string> {
  return new Map(
    readdirSync(docsDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => [name, readFileSync(docsDir + name, "utf8")]),
  );
}

describe("buildWiki", () => {
  const docs = readDocs();
  const wiki = buildWiki(docs, options);

  it("is deterministic", () => {
    expect([...buildWiki(readDocs(), options)]).toEqual([...wiki]);
  });

  it("publishes every doc, grouped, with Home, the sidebar and the footer", () => {
    expect([...wiki.keys()].sort()).toEqual(
      [
        "Home.md",
        "_Footer.md",
        "_Sidebar.md",
        ...wikiPages.map((page) => `${page.name}.md`),
      ].sort(),
    );
    // Every docs/ file is a wiki page and every page file exists.
    expect([...docs.keys()].sort()).toEqual(wikiPages.map((page) => page.source).sort());
    expect(new Set(wikiPages.map((page) => page.name)).size).toBe(wikiPages.length);
    for (const page of wikiPages) {
      expect(wikiGroups.map((group) => group.id)).toContain(page.group);
    }
  });

  it("titles each page like the first heading of its source", () => {
    for (const page of wikiPages) {
      const heading = (docs.get(page.source) ?? "").split("\n")[0]?.trim();
      expect(heading, page.source).toBe(`# ${page.title}`);
    }
  });

  it("keeps the published page names stable", () => {
    // Wiki page names are URLs; a removed or renamed name needs a redirect-equivalent page.
    const kept = [
      "GitHub-Action",
      "Design-format",
      "Expressions",
      "Components-and-templates",
      "GitHub-data",
      "Data-sources",
      "CLI",
      "Output-formats",
      "Fonts-and-licensing",
      "Asset-loading",
      "Renderer",
      "Editor",
      "Troubleshooting",
    ];
    const names = wikiPages.map((page) => page.name);
    for (const name of kept) expect(names, name).toContain(name);
  });

  it("separates the contributor pages from the user guide", () => {
    const contributors = wikiPages.filter((page) => page.group === "contributors");
    expect(contributors.map((page) => page.source)).toEqual([
      "golden-tests.md",
      "wiki-publishing.md",
    ]);
    const sidebar = wiki.get("_Sidebar.md") ?? "";
    const heading = sidebar.indexOf("**Contributors**");
    expect(heading).toBeGreaterThan(sidebar.indexOf("**Reference**"));
    for (const page of wikiPages) {
      const at = sidebar.indexOf(`](${page.name})`);
      expect(at > heading, page.name).toBe(page.group === "contributors");
    }
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

  it("puts the workflow of docs/action.md into the Action page and the getting-started page", () => {
    const workflow = extractWorkflow(docs.get("action.md") ?? "");
    expect(workflow).toContain("uses: MrLarkyy/Readmint@vX.Y.Z");
    expect(wiki.get("GitHub-Action.md")).toContain(workflow);
    expect(wiki.get("Getting-started.md")).toContain(workflow);
  });

  it("links the examples repository from Home, the getting-started page and the footer", () => {
    for (const file of ["Home.md", "Getting-started.md", "_Footer.md"]) {
      expect(wiki.get(file), file).toContain(`](${examplesRepository})`);
    }
  });

  it("gives Home a reading route through every group and lists every page in the sidebar", () => {
    const home = wiki.get("Home.md") ?? "";
    const route = home.slice(home.indexOf("## Reading route"), home.indexOf("## Start here"));
    wikiGroups.forEach((group, index) => {
      expect(route).toContain(`${String(index + 1)}. **${group.title}**`);
    });
    expect(route).toContain("](Getting-started)");
    const sidebar = wiki.get("_Sidebar.md") ?? "";
    for (const page of wikiPages) {
      expect(sidebar).toContain(`](${page.name})`);
      expect(home).toContain(`- [${page.title}](${page.name}): ${page.summary}`);
    }
    for (const group of wikiGroups) expect(sidebar).toContain(`**${group.title}**`);
  });

  it("fails on a missing source", () => {
    const partial = new Map(docs);
    partial.delete("cli.md");
    expect(() => buildWiki(partial, options)).toThrow("docs/cli.md is missing");
  });
});

describe("rewriteLinks", () => {
  const pages: readonly WikiPage[] = [
    { source: "a.md", name: "Page-A", title: "Page A", group: "guides", summary: "" },
  ];
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
