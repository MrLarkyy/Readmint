import type { GitHubLanguage } from "./GitHubData.js";

/**
 * Bumped with every change to this table or to the excluded paths: cached per-commit sums carry
 * it in their key, so a change never serves sums counted under the old rules.
 */
export const AUTHORED_TABLE_VERSION = 1;

// Names and colours follow GitHub Linguist (MIT licence, https://github.com/github-linguist/linguist).
// Only unambiguous extensions are listed: a file whose extension is not here is not counted, never
// guessed (`.h` is C or C++, so it is left out; data and prose such as JSON, YAML and Markdown are
// not code the user wrote).
const KOTLIN = { name: "Kotlin", color: "#A97BFF" };
const JAVA = { name: "Java", color: "#b07219" };
const TYPESCRIPT = { name: "TypeScript", color: "#3178c6" };
const JAVASCRIPT = { name: "JavaScript", color: "#f1e05a" };
const CPP = { name: "C++", color: "#f34b7d" };
const SHELL = { name: "Shell", color: "#89e051" };
const CSS = { name: "CSS", color: "#663399" };
const HTML = { name: "HTML", color: "#e34c26" };
const PHP = { name: "PHP", color: "#4F5D95" };
const GRADLE = { name: "Gradle", color: "#02303a" };

/** Language by lowercase file extension, with the dot. */
export const AUTHORED_EXTENSIONS: ReadonlyMap<string, GitHubLanguage> = new Map([
  [".kt", KOTLIN],
  [".kts", KOTLIN],
  [".java", JAVA],
  [".ts", TYPESCRIPT],
  [".tsx", TYPESCRIPT],
  [".mts", TYPESCRIPT],
  [".cts", TYPESCRIPT],
  [".js", JAVASCRIPT],
  [".jsx", JAVASCRIPT],
  [".mjs", JAVASCRIPT],
  [".cjs", JAVASCRIPT],
  [".py", { name: "Python", color: "#3572A5" }],
  [".go", { name: "Go", color: "#00ADD8" }],
  [".rs", { name: "Rust", color: "#dea584" }],
  [".c", { name: "C", color: "#555555" }],
  [".cpp", CPP],
  [".cc", CPP],
  [".cxx", CPP],
  [".hpp", CPP],
  [".cs", { name: "C#", color: "#178600" }],
  [".swift", { name: "Swift", color: "#F05138" }],
  [".rb", { name: "Ruby", color: "#701516" }],
  [".php", PHP],
  [".scala", { name: "Scala", color: "#c22d40" }],
  [".groovy", { name: "Groovy", color: "#4298b8" }],
  [".gradle", GRADLE],
  [".sh", SHELL],
  [".bash", SHELL],
  [".zsh", SHELL],
  [".ps1", { name: "PowerShell", color: "#012456" }],
  [".html", HTML],
  [".htm", HTML],
  [".css", CSS],
  [".scss", { name: "SCSS", color: "#c6538c" }],
  [".vue", { name: "Vue", color: "#41b883" }],
  [".svelte", { name: "Svelte", color: "#ff3e00" }],
  [".lua", { name: "Lua", color: "#000080" }],
  [".dart", { name: "Dart", color: "#00B4AB" }],
]);

/** Language by exact file name. */
export const AUTHORED_FILE_NAMES: ReadonlyMap<string, GitHubLanguage> = new Map([
  ["Dockerfile", { name: "Dockerfile", color: "#384d54" }],
  ["Makefile", { name: "Makefile", color: "#427819" }],
]);

/** Directory names whose files are built, copied or generated output. */
export const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "third_party",
  ".gradle",
  "__snapshots__",
  "golden",
  "generated",
]);

/** Extensions of files that are not hand-written code: images, fonts, maps, snapshots, locks. */
export const EXCLUDED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".lock",
  ".map",
  ".snap",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
]);

/** Exact lowercase file names of lock files and wrappers. */
export const EXCLUDED_FILE_NAMES: ReadonlySet<string> = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "npm-shrinkwrap.json",
]);

/** Colour by language name, for every language the table can produce. */
export const AUTHORED_LANGUAGE_COLORS: ReadonlyMap<string, string | null> = new Map(
  [...AUTHORED_EXTENSIONS.values(), ...AUTHORED_FILE_NAMES.values()].map((language) => [
    language.name,
    language.color,
  ]),
);
