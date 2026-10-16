import { rewriteLinks } from "./rewriteLinks.js";
import type { WikiGroup, WikiPage } from "./WikiPage.js";
import { wikiGroups, wikiPages } from "./wikiPages.js";

/** The repository of ready-to-copy workflows; linked from Home, the footer and the getting-started page. */
export const examplesRepository = "https://github.com/MrLarkyy/readmint-template-test";

export interface WikiOptions {
  /** Repository URL without a trailing slash, e.g. https://github.com/MrLarkyy/Readmint */
  readonly repository: string;
  readonly branch: string;
  readonly pages?: readonly WikiPage[];
  readonly groups?: readonly WikiGroup[];
}

/**
 * Builds the wiki from the docs/ files (file name to text). The result maps a wiki file name to its text: one file per
 * published page, Home.md, _Sidebar.md and _Footer.md. The output depends on the inputs only.
 */
export function buildWiki(
  docs: ReadonlyMap<string, string>,
  options: WikiOptions,
): Map<string, string> {
  const pages = options.pages ?? wikiPages;
  const groups = options.groups ?? wikiGroups;
  const docsUrl = `${options.repository}/blob/${options.branch}/docs`;
  const files = new Map<string, string>();
  files.set("Home.md", home(groups, pages, docsUrl));
  files.set("_Sidebar.md", sidebar(groups, pages));
  files.set("_Footer.md", footer(pages, docsUrl));
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

function inGroup(pages: readonly WikiPage[], group: WikiGroup): WikiPage[] {
  return pages.filter((page) => page.group === group.id);
}

function link(page: WikiPage): string {
  return `[${page.title}](${page.name})`;
}

function home(groups: readonly WikiGroup[], pages: readonly WikiPage[], docsUrl: string): string {
  const route = groups.flatMap((group, index) => {
    const first = inGroup(pages, group)[0];
    return first === undefined
      ? []
      : [`${String(index + 1)}. **${group.title}**: ${group.summary}. Begin with ${link(first)}.`];
  });
  const sections = groups.flatMap((group) => [
    `## ${group.title}`,
    "",
    ...inGroup(pages, group).map((page) => `- ${link(page)}: ${page.summary}`),
    "",
  ]);
  return [
    "# Readmint",
    "",
    "> Generated from the `docs/` folder of the repository. Edit it there; changes made on the wiki are overwritten.",
    "",
    "**Design your README. Any font, any data, any style.** Readmint renders README graphics from designs you make",
    "yourself and keeps them current with a GitHub Action in your own repository.",
    "",
    `Ready-to-copy workflows and designs: the [examples repository](${examplesRepository}).`,
    "",
    "## Reading route",
    "",
    ...route,
    "",
    ...sections,
    `Source of these pages: [docs/](${docsUrl})`,
    "",
  ].join("\n");
}

function sidebar(groups: readonly WikiGroup[], pages: readonly WikiPage[]): string {
  const sections = groups.flatMap((group) => [
    `**${group.title}**`,
    "",
    ...inGroup(pages, group).map((page) => `- ${link(page)}`),
    "",
  ]);
  return ["**[Home](Home)**", "", ...sections].join("\n");
}

function footer(pages: readonly WikiPage[], docsUrl: string): string {
  const start = pages.find((page) => page.group === "start");
  const route = start === undefined ? [] : [link(start)];
  return [
    ["[Home](Home)", ...route, `[Examples](${examplesRepository})`, `[Source](${docsUrl})`].join(
      " · ",
    ),
    "",
  ].join("\n");
}
