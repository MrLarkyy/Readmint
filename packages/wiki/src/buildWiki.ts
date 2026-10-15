import { extractWorkflow } from "./extractWorkflow.js";
import { rewriteLinks } from "./rewriteLinks.js";
import type { WikiPage } from "./WikiPage.js";
import { wikiPages } from "./wikiPages.js";

export interface WikiOptions {
  /** Repository URL without a trailing slash, e.g. https://github.com/MrLarkyy/Readmint */
  readonly repository: string;
  readonly branch: string;
  readonly pages?: readonly WikiPage[];
}

/**
 * Builds the wiki from the docs/ files (file name to text). The result maps a wiki file name to its text: one file per
 * published page, Home.md and _Sidebar.md. The output depends on the inputs only.
 */
export function buildWiki(
  docs: ReadonlyMap<string, string>,
  options: WikiOptions,
): Map<string, string> {
  const pages = options.pages ?? wikiPages;
  const docsUrl = `${options.repository}/blob/${options.branch}/docs`;
  const files = new Map<string, string>();
  files.set("Home.md", home(docs, pages, docsUrl));
  files.set("_Sidebar.md", sidebar(pages));
  for (const page of pages) {
    const [title = "", ...rest] = source(docs, page.source).split("\n");
    const body = rewriteLinks(rest.join("\n"), pages, docsUrl);
    files.set(`${page.name}.md`, `${title}\n\n${banner(page.source, docsUrl)}\n${body}`);
  }
  return files;
}

function source(docs: ReadonlyMap<string, string>, file: string): string {
  const text = docs.get(file);
  if (text === undefined) throw new Error(`docs/${file} is missing`);
  return text.replace(/\r\n/g, "\n").replace(/\n*$/, "\n");
}

function banner(file: string, docsUrl: string): string {
  return `> Generated from [docs/${file}](${docsUrl}/${file}) in the repository. Edit it there; changes made on the wiki are overwritten.`;
}

function title(page: WikiPage): string {
  return page.name.replaceAll("-", " ");
}

function home(
  docs: ReadonlyMap<string, string>,
  pages: readonly WikiPage[],
  docsUrl: string,
): string {
  const workflow = extractWorkflow(source(docs, "action.md"));
  const index = pages.map((page) => `- [${title(page)}](${page.name}): ${page.summary}`);
  return [
    "# Readmint",
    "",
    "> Generated from the `docs/` folder of the repository. Edit it there; changes made on the wiki are overwritten.",
    "",
    "**Design your README. Any font, any data, any style.** Readmint renders README graphics from designs you make",
    "yourself and keeps them current with a GitHub Action in your own repository.",
    "",
    "## Getting started",
    "",
    "1. Write a design (YAML or JSON) in your repository, for example `readmint/designs/card.yaml`. Start from a",
    "   template ([Components and templates](Components-and-templates)) and shape it with the",
    "   [Design format](Design-format).",
    "2. Add this workflow as `.github/workflows/readmint.yml`, with an exact release tag instead of `vX.Y.Z`:",
    "",
    workflow,
    "",
    "3. Run it once with *Run workflow*. It commits the rendered files and prints the `<picture>` snippet in the log",
    "   group `README snippet`; paste the snippet into your README.",
    "",
    "Every input, the permissions the push needs and the errors are in [GitHub Action](GitHub-Action). To try a design",
    "on your machine first, use the [CLI](CLI).",
    "",
    "## Pages",
    "",
    ...index,
    "",
    `Source of these pages: [docs/](${docsUrl})`,
    "",
  ].join("\n");
}

function sidebar(pages: readonly WikiPage[]): string {
  const links = pages.map((page) => `- [${title(page)}](${page.name})`);
  return ["**[Home](Home)**", "", ...links, ""].join("\n");
}
