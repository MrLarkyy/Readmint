import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const licenceFile = /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i;

/** Licence files a package keeps outside its root folder: the libwebp notice of the bundled codec. */
const nestedLicences: Readonly<Record<string, readonly string[]>> = {
  "@jsquash/webp": ["codec/LICENSE.codec.md"],
};

/** Licence texts in this repository for packages that publish none (scripts/licences/README.md). */
const suppliedLicences: Readonly<Record<string, string>> = {
  "@resvg/resvg-wasm": "resvg-wasm.LICENSE",
};

interface BundledPackage {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
  readonly texts: readonly string[];
}

/**
 * The legal comment put at the top of the Action bundle: for every npm package any of the
 * bundled modules comes from (workspace packages excluded: they are this repository's own
 * code), its name, version, licence and the full text of its licence and notice files, sorted
 * by name. A package that keeps its licence elsewhere or publishes none gets the text listed
 * above. Throws when a package still has no licence text: the bundle is never built without one.
 */
export function licenceBanner(moduleIds: Iterable<string>): string {
  const packages = new Map<string, BundledPackage>();
  for (const id of moduleIds) {
    const root = packageRoot(id);
    if (root === undefined || packages.has(root)) continue;
    const bundled = readPackage(root);
    if (bundled !== undefined) packages.set(root, bundled);
  }
  const sorted = [...packages.values()].sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name < b.name ? -1 : 1,
  );
  const lines = ["Third-party software bundled in this file, with its licences:"];
  for (const bundled of sorted) {
    lines.push("", `Package: ${bundled.name}@${bundled.version} (${bundled.licence})`);
    for (const text of bundled.texts) lines.push("", ...text.trimEnd().split(/\r?\n/));
  }
  const body = lines.map((line) => ` *${line === "" ? "" : ` ${line.replaceAll("*/", "* /")}`}`);
  return `/*!\n${body.join("\n")}\n */`;
}

function packageRoot(id: string): string | undefined {
  if (!path.isAbsolute(id)) return undefined;
  const parts = path.normalize(id).split(path.sep);
  const index = parts.lastIndexOf("node_modules");
  if (index === -1) return undefined;
  const scoped = parts[index + 1]?.startsWith("@") === true;
  const end = index + (scoped ? 3 : 2);
  if (end > parts.length - 1) return undefined;
  return parts.slice(0, end).join(path.sep);
}

function readPackage(root: string): BundledPackage | undefined {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    name?: unknown;
    version?: unknown;
    license?: unknown;
  };
  const name = typeof manifest.name === "string" ? manifest.name : path.basename(root);
  if (name.startsWith("@readmint/")) return undefined;
  const files = [
    ...readdirSync(root)
      .filter((file) => licenceFile.test(file))
      .sort(),
    ...(nestedLicences[name] ?? []),
  ].map((file) => path.join(root, file));
  const supplied = suppliedLicences[name];
  if (files.length === 0 && supplied !== undefined) {
    files.push(path.join(import.meta.dirname, "licences", supplied));
  }
  if (files.length === 0) throw new Error(`${name} ships no licence file to bundle`);
  return {
    name,
    version: typeof manifest.version === "string" ? manifest.version : "unknown",
    licence: typeof manifest.license === "string" ? manifest.license : "see below",
    texts: files.map((file) => readFileSync(file, "utf8")),
  };
}
