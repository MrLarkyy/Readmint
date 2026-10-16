export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/** The heading anchors GitHub generates for a Markdown text (fenced code skipped). */
export function anchors(markdown: string): Set<string> {
  const found = new Set<string>();
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced ? /^#{1,6}\s+(.*)$/.exec(line)?.[1] : undefined;
    if (heading !== undefined) found.add(slug(heading));
  }
  return found;
}

/** The targets of the Markdown links in a text, outside fenced and inline code. */
export function linkTargets(markdown: string): string[] {
  const targets: string[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    for (const part of line.split(/(`[^`]*`)/).filter((_, index) => index % 2 === 0)) {
      for (const match of part.matchAll(/\]\(([^)\s]+)\)/g)) targets.push(match[1] ?? "");
    }
  }
  return targets;
}
