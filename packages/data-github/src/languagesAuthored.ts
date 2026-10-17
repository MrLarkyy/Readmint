import { AUTHORED_LANGUAGE_COLORS } from "./authoredLanguageTable.js";
import { compareText } from "./compareText.js";
import type { GitHubLanguageAuthored } from "./GitHubData.js";

/**
 * Turns added lines per language into shares. Sums are integers and the order is fixed (share,
 * additions, name) before any division, so the same sums always give the same bytes. A language
 * outside the table is dropped: stored sums are validated against it, not trusted.
 */
export function languagesAuthored(sums: ReadonlyMap<string, number>): GitHubLanguageAuthored[] {
  const entries = [...sums].filter(([name, additions]) => {
    return additions > 0 && AUTHORED_LANGUAGE_COLORS.has(name);
  });
  let total = 0;
  for (const [, additions] of entries) total += additions;
  if (total === 0) return [];
  return entries
    .sort(
      ([leftName, left], [rightName, right]) => right - left || compareText(leftName, rightName),
    )
    .map(([name, additions]) => ({
      name,
      color: AUTHORED_LANGUAGE_COLORS.get(name) ?? null,
      share: additions / total,
      additions,
    }));
}
