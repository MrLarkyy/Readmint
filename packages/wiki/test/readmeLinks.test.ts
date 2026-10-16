import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWiki, defaultRepository, wikiPages, wikiPageUrl } from "../src/index.js";
import { readGoldenImages } from "./goldenImages.js";
import { anchors, linkTargets } from "./markdown.js";
import { wikiLinkProblems, type WikiLinkContext } from "./wikiLinkProblems.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const docsDir = join(root, "docs");
const skipped = new Set(["node_modules", "dist", ".git"]);

function read(file: string): string {
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function readmes(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...readmes(path));
    else if (entry.name === "README.md") found.push(path);
  }
  return found;
}

const docs = new Map(
  readdirSync(docsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => [name, read(join(docsDir, name))]),
);
const built = buildWiki(docs, {
  repository: defaultRepository,
  branch: "main",
  images: readGoldenImages(),
});
const context: WikiLinkContext = {
  repository: defaultRepository,
  pageNames: new Set([...built.keys()].map((file) => file.replace(/\.md$/, ""))),
  pages: wikiPages,
  anchorsOf: (name) => {
    const text = built.get(`${name}.md`);
    return typeof text === "string" ? anchors(text) : undefined;
  },
};

const files = readmes(root);
const wikiUrl = (source: string, anchor?: string): string => {
  const page = wikiPages.find((candidate) => candidate.source === source);
  if (page === undefined) throw new Error(source);
  return wikiPageUrl(defaultRepository, page, anchor);
};

describe("wiki links in the READMEs", () => {
  it("finds the root README and the profile template READMEs", () => {
    const names = files.map((file) => relative(root, file).replaceAll("\\", "/"));
    expect(names).toContain("README.md");
    for (const template of ["pinscreen", "year-ring", "horizon"]) {
      expect(names).toContain(`packages/components/templates/profiles/${template}/README.md`);
    }
  });

  for (const file of files) {
    it(`${relative(root, file).replaceAll("\\", "/")} links the user guide to existing wiki pages and headings`, () => {
      expect(wikiLinkProblems(read(file), context)).toEqual([]);
    });
  }

  it("links the guide pages of the root README as wiki URLs, keeping the docs/ folder link", () => {
    const targets = linkTargets(read(join(root, "README.md")));
    expect(targets).toContain(wikiUrl("components.md", "starter-templates"));
    expect(targets).toContain(wikiUrl("wiki-publishing.md"));
    expect(targets).toContain("docs");
    expect(
      targets.filter((target) => target.startsWith(`${defaultRepository}/wiki/`)).length,
    ).toBeGreaterThan(15);
  });

  it("links the profile templates to the GitHub data and profile template wiki pages", () => {
    for (const template of ["pinscreen", "year-ring", "horizon"]) {
      const file = join(root, "packages/components/templates/profiles", template, "README.md");
      expect(existsSync(file)).toBe(true);
      const targets = linkTargets(read(file));
      expect(targets).toContain(wikiUrl("data-github.md"));
      expect(targets).toContain(wikiUrl("components.md", "profile-templates"));
    }
  });
});

describe("wikiLinkProblems", () => {
  const url = (name: string, anchor = ""): string =>
    `[x](${defaultRepository}/wiki/${name}${anchor})`;

  it("accepts a link to a page and a heading that exist", () => {
    expect(wikiLinkProblems(url("GitHub-Action"), context)).toEqual([]);
    expect(
      wikiLinkProblems(url("Components-and-templates", "#profile-templates"), context),
    ).toEqual([]);
    expect(wikiLinkProblems(`[docs](docs) [x](${defaultRepository}/wiki)`, context)).toEqual([]);
  });

  it("reports an unknown page", () => {
    expect(wikiLinkProblems(url("No-such-page"), context)).toHaveLength(1);
  });

  it("reports an unknown heading", () => {
    expect(wikiLinkProblems(url("GitHub-Action", "#no-such-heading"), context)).toHaveLength(1);
  });

  it("reports a relative link to a published docs/ file and names the wiki URL", () => {
    const problems = wikiLinkProblems("[a](docs/action.md#inputs)", context);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`${defaultRepository}/wiki/GitHub-Action#inputs`);
  });

  it("reports a blob link to a published docs/ file", () => {
    const blob = `[a](${defaultRepository}/blob/main/docs/cli.md)`;
    expect(wikiLinkProblems(blob, context)).toHaveLength(1);
  });

  it("ignores links in code", () => {
    expect(wikiLinkProblems("`[a](docs/action.md)`\n```\n[a](docs/cli.md)\n```", context)).toEqual(
      [],
    );
  });
});
