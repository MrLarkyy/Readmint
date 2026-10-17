import { authoredLanguage } from "./authoredLanguage.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { ResponseReader } from "./ResponseReader.js";

// GitHub pages a commit's file list in 300s; only the first page is read.
const MAX_LISTED_FILES = 3000;

/**
 * Sums the added lines of one REST commit (`files[].filename`, `additions`) per language of the
 * committed table, in the order the files list them. Files beyond the first 300, paths at the
 * string limit and files of no known language add nothing; a malformed entry is a malformed
 * response.
 */
export function parseCommitFiles(json: unknown): Map<string, number> {
  const commit = ResponseReader.of(json, "commit").object();
  const additions = new Map<string, number>();
  if (!commit.hasField("files")) return additions;
  const files = commit.field("files").items(MAX_LISTED_FILES).slice(0, GitHubLimits.maxCommitFiles);
  for (const file of files) {
    const added = file.field("additions").count();
    const path = file.field("filename").clippedString();
    if (path.length >= GitHubLimits.maxStringLength) continue;
    const language = authoredLanguage(path);
    if (language === null) continue;
    additions.set(language.name, (additions.get(language.name) ?? 0) + added);
  }
  return additions;
}
