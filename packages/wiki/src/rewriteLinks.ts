import { posix } from "node:path";
import type { WikiPage } from "./WikiPage.js";

const linkTarget = /\]\(([^)\s]*)\)/g;

/**
 * Rewrites the relative links of one docs/ page for the wiki: a link to a published page becomes its wiki name, any
 * other relative link points at the file in the repository. Fenced code and inline code are left alone.
 */
export function rewriteLinks(
  markdown: string,
  pages: readonly WikiPage[],
  docsUrl: string,
): string {
  const byFile = new Map(pages.map((page) => [page.source, page.name]));
  let fence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker !== undefined) {
        if (fence === undefined) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
        return line;
      }
      if (fence !== undefined) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((part, index) =>
          index % 2 === 1
            ? part
            : part.replace(
                linkTarget,
                (_whole, target: string) => `](${rewriteTarget(target, byFile, docsUrl)})`,
              ),
        )
        .join("");
    })
    .join("\n");
}

function rewriteTarget(
  target: string,
  byFile: ReadonlyMap<string, string>,
  docsUrl: string,
): string {
  if (target === "" || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  const hash = target.indexOf("#");
  const path = posix.normalize(hash < 0 ? target : target.slice(0, hash));
  const anchor = hash < 0 ? "" : target.slice(hash);
  const name = byFile.get(path);
  if (name !== undefined) return name + anchor;
  if (path.startsWith("../")) return `${docsUrl.replace(/\/docs$/, "")}/${path.slice(3)}${anchor}`;
  return `${docsUrl}/${path}${anchor}`;
}
