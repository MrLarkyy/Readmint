/** GitHub's heading anchor: lowercase, punctuation dropped except `-` and `_`, spaces to hyphens. */
export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/** Calls `visit` for each line outside fenced code; a fence closes with the same character and at least its length. */
function eachProseLine(markdown: string, visit: (line: string) => void): void {
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === undefined) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence === undefined) visit(line);
  }
}

/** The heading anchors GitHub generates for a Markdown text; a repeated heading gets `-1`, `-2`, … */
export function anchors(markdown: string): Set<string> {
  const found = new Set<string>();
  const seen = new Map<string, number>();
  eachProseLine(markdown, (line) => {
    const heading = /^ {0,3}#{1,6}\s+(.*)$/.exec(line)?.[1];
    if (heading === undefined) return;
    const base = slug(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    found.add(count === 0 ? base : `${base}-${String(count)}`);
  });
  return found;
}

/** The targets of the Markdown links in a text, outside fenced and inline code. */
export function linkTargets(markdown: string): string[] {
  const targets: string[] = [];
  eachProseLine(markdown, (line) => {
    for (const part of line.split(/(`[^`]*`)/).filter((_, index) => index % 2 === 0)) {
      for (const match of part.matchAll(/\]\(([^)\s]+)\)/g)) targets.push(match[1] ?? "");
    }
  });
  return targets;
}
