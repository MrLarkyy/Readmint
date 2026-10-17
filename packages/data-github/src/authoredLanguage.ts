import { AUTHORED_EXTENSIONS, AUTHORED_FILE_NAMES } from "./authoredLanguageTable.js";
import type { GitHubLanguage } from "./GitHubData.js";
import { baseName, extensionOf, isGeneratedPath } from "./generatedPath.js";

/**
 * The language of a file in a commit, from the committed table by name and extension only.
 * `null` for a generated or vendored path and for any file the table does not know.
 */
export function authoredLanguage(path: string): GitHubLanguage | null {
  if (isGeneratedPath(path)) return null;
  const name = baseName(path);
  return AUTHORED_FILE_NAMES.get(name) ?? AUTHORED_EXTENSIONS.get(extensionOf(name)) ?? null;
}
