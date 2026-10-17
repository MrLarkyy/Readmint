import {
  EXCLUDED_DIRECTORIES,
  EXCLUDED_EXTENSIONS,
  EXCLUDED_FILE_NAMES,
} from "./authoredLanguageTable.js";

/** The file name of a `/`-separated path. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The lowercase extension with its dot, `""` when the name has none (a leading dot is none). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

/** True for generated, vendored, built, lock, minified, snapshot, image and font files. */
export function isGeneratedPath(path: string): boolean {
  const segments = path.split("/");
  const name = segments.pop() ?? "";
  if (segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment.toLowerCase()))) return true;
  const lower = name.toLowerCase();
  return (
    EXCLUDED_FILE_NAMES.has(lower) ||
    lower.startsWith("gradle-wrapper") ||
    lower.includes(".min.") ||
    lower.endsWith(".d.ts") ||
    EXCLUDED_EXTENSIONS.has(extensionOf(lower))
  );
}
