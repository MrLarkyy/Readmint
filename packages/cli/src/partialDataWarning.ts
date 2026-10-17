import type { GitHubPartialPart } from "@readmint/data-github";

const effects: Readonly<Record<GitHubPartialPart, string>> = {
  activity:
    "github.status and github.pushes are empty and github.pinned falls back to the top repositories",
  weeks: "github.pinned[].weeklyCommits is null",
  authored:
    "github.languagesAuthored counts fewer commits than asked for (GitHub stopped the reading; run again later)",
  "authored-cap":
    "github.languagesAuthored counts only the newest commits (raise language-commit-cap to read more)",
};

/**
 * The one line the CLI and the Action print when GitHub refused a part of the data: the parts and what each leaves
 * empty. It holds no data and no token.
 */
export function partialDataWarning(parts: readonly GitHubPartialPart[]): string {
  return `GitHub data is incomplete (${parts.join(", ")}): ${parts.map((part) => effects[part]).join("; ")}`;
}
