import type { WikiPage } from "../src/index.js";
import { linkTargets } from "./markdown.js";

export interface WikiLinkContext {
  /** Repository URL without a trailing slash. */
  readonly repository: string;
  /** Names of the generated pages a link may point at (published pages, Home, Gallery). */
  readonly pageNames: ReadonlySet<string>;
  /** The published pages, to recognise a link to their source in docs/. */
  readonly pages: readonly WikiPage[];
  /** Heading anchors of a generated page by its name. */
  readonly anchorsOf: (name: string) => ReadonlySet<string> | undefined;
}

/** What is wrong with the links of a README: a wiki link to nothing, or a link to a docs/ file that has a wiki page. */
export function wikiLinkProblems(markdown: string, context: WikiLinkContext): string[] {
  const problems: string[] = [];
  const wikiPrefix = `${context.repository}/wiki/`;
  for (const target of linkTargets(markdown)) {
    const [path = "", anchor] = target.split("#");
    if (target.startsWith(wikiPrefix)) {
      const name = path.slice(wikiPrefix.length);
      if (!context.pageNames.has(name)) {
        problems.push(`${target}: no wiki page ${name}`);
      } else if (anchor !== undefined && context.anchorsOf(name)?.has(anchor) !== true) {
        problems.push(`${target}: no heading #${anchor} on wiki page ${name}`);
      }
      continue;
    }
    const file = /(?:^|\/)docs\/([^/]+\.md)$/.exec(path)?.[1];
    if (file === undefined) continue;
    const page = context.pages.find((candidate) => candidate.source === file);
    if (page !== undefined) {
      const suffix = anchor === undefined ? "" : `#${anchor}`;
      problems.push(`${target}: link ${wikiPrefix}${page.name}${suffix} instead`);
    }
  }
  return problems;
}
