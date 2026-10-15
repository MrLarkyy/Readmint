/**
 * Writes scripts/licences/resvg-wasm-crates.txt: every Rust crate compiled into @resvg/resvg-wasm's resvg.wasm, with
 * its exact version, licence and the licence files it ships, copied verbatim. resvg-js commits no Cargo.lock, so the
 * crate graph is resolved here as cargo would have on the day @resvg/resvg-wasm 2.6.2 was published: the dependencies
 * resvg-js 2.6.2 declares for wasm32 (with their features) from the crates.io index, each requirement at the newest
 * version published by then, and the versions the binary itself names in its source paths pinned. Build-time crates
 * (build dependencies, proc macros and what only they use) are not in the binary and are left out.
 *
 * Run from the repository root with Node 24: `node packages/action/scripts/resvgCrates.ts`. It needs the network
 * (index.crates.io, crates.io, static.crates.io, raw.githubusercontent.com) and a `pnpm install`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";

const cutoff = Date.parse("2024-03-26T13:43:40Z");
const target = "wasm32-unknown-unknown";
const output = new URL("./licences/resvg-wasm-crates.txt", import.meta.url);
const userAgent = "readmint-licence-list (https://github.com/MrLarkyy/Readmint)";
const licenceFile = /^(?:licen[cs]e|copying|notice|copyright|unlicense)(?:[._-].*)?$/i;

interface Requirement {
  readonly name: string;
  readonly req: string;
  readonly features: readonly string[];
  readonly defaultFeatures: boolean;
}

interface IndexDep {
  readonly name: string;
  readonly req: string;
  readonly features: readonly string[];
  readonly optional: boolean;
  readonly default_features: boolean;
  readonly target: string | null;
  readonly kind: string | null;
  readonly package?: string;
}

interface IndexEntry {
  readonly vers: string;
  readonly deps: readonly IndexDep[];
  readonly features: Readonly<Record<string, readonly string[]>>;
  readonly features2?: Readonly<Record<string, readonly string[]>>;
  readonly yanked: boolean;
  /** Publication time; the index has it for versions published since 2024. */
  readonly pubtime?: string;
}

interface Node {
  readonly name: string;
  readonly version: string;
  readonly entry: IndexEntry;
  readonly features: Set<string>;
  readonly deps: Set<string>;
}

interface CrateFiles {
  readonly licence: string;
  readonly authors: readonly string[];
  readonly repository: string;
  readonly procMacro: boolean;
  readonly texts: readonly { readonly file: string; readonly text: string }[];
}

/** What resvg-js 2.6.2 (Cargo.toml, wasm32 target) builds, the git crates replaced by their own dependencies. */
const roots: readonly Requirement[] = [
  // resvg-js 2.6.2 [dependencies] and [target.'cfg(target_arch = "wasm32")'.dependencies]
  dep("env_logger", "0.11.0"),
  dep("log", "0.4"),
  dep("serde", "1", ["derive"]),
  dep("serde_json", "1"),
  dep("svgtypes", "0.14.0"),
  dep("thiserror", "1.0.37"),
  dep("png", "=0.17.5"),
  dep("pathfinder_geometry", "0.5.1"),
  dep("pathfinder_content", "0.5.0", [], false),
  dep("pathfinder_simd", "0.5.2", ["pf-no-simd"]),
  dep("futures", "0.3.21"),
  dep("wasm-bindgen", "0.2.87"),
  dep("js-sys", "0.3.64"),
  // resvg (zimond/resvg 3495d870, crates/resvg) with default-features = false, features = ["raster-images", "text"]
  dep("gif", "0.12"),
  dep("jpeg-decoder", "0.3", ["platform_independent"], false),
  dep("pico-args", "0.5", ["eq-separator"]),
  dep("png", "0.17"),
  dep("rgb", "0.8"),
  dep("svgtypes", "0.11"),
  dep("tiny-skia", "0.10"),
  // usvg (crates/usvg) with features = ["text"]
  dep("base64", "0.21"),
  dep("xmlwriter", "0.1"),
  // usvg-parser (crates/usvg-parser)
  dep("data-url", "0.2"),
  dep("flate2", "1.0", ["rust_backend"], false),
  dep("imagesize", "0.12"),
  dep("kurbo", "0.9"),
  dep("roxmltree", "0.18"),
  dep("simplecss", "0.2"),
  dep("siphasher", "0.3"),
  // usvg-tree (crates/usvg-tree)
  dep("kurbo", "0.9.5"),
  dep("rctree", "0.5"),
  dep("strict-num", "0.1.1"),
  dep("tiny-skia-path", "0.10"),
  // usvg-text-layout (crates/usvg-text-layout) with default-features = false
  dep("fontdb", "0.14", [], false),
  dep("rustybuzz", "0.7"),
  dep("unicode-bidi", "0.3"),
  dep("unicode-script", "0.5"),
  dep("unicode-vo", "0.1"),
  // woff2 (yisibl/woff2-rs 88cce4c)
  dep("brotli", "3.3.4", ["std"], false),
  dep("bytes", "1.4.0"),
  dep("four-cc", "0.3.0"),
  dep("safer-bytes", "0.2.0"),
  dep("thiserror", "1.0.44"),
  dep("bitvec", "1.0.1"),
];

/** Crates resvg-js takes from git, with the licence files of those repositories at the pinned revisions. */
const gitCrates: readonly {
  name: string;
  version: string;
  licence: string;
  files: readonly string[];
}[] = [
  ...["resvg", "usvg", "usvg-parser", "usvg-text-layout", "usvg-tree"].map((name) => ({
    name,
    version: "0.34.1 (git zimond/resvg 3495d870)",
    licence: "MPL-2.0",
    files: ["https://raw.githubusercontent.com/zimond/resvg/3495d870/LICENSE.txt"],
  })),
  {
    name: "woff2",
    version: "0.3.0 (git yisibl/woff2-rs 88cce4c)",
    licence: "Apache-2.0",
    files: ["https://raw.githubusercontent.com/yisibl/woff2-rs/88cce4c/LICENSE"],
  },
];

function dep(
  name: string,
  req: string,
  features: readonly string[] = [],
  defaultFeatures = true,
): Requirement {
  return { name, req, features, defaultFeatures };
}

// ---- semver (Cargo's requirement syntax) ----

type Version = readonly [number, number, number, string];

function parseVersion(text: string): Version {
  const [core = "", pre = ""] = text.split("+")[0]?.split(/-(.*)/s) ?? [];
  const [major = 0, minor = 0, patch = 0] = core.split(".").map(Number);
  return [major, minor, patch, pre];
}

function compare(a: Version, b: Version): number {
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] as number) - (b[index] as number);
    if (difference !== 0) return difference;
  }
  if (a[3] === b[3]) return 0;
  if (a[3] === "") return 1;
  if (b[3] === "") return -1;
  return a[3] < b[3] ? -1 : 1;
}

function satisfies(versionText: string, req: string): boolean {
  const version = parseVersion(versionText);
  if (version[3] !== "" && !req.includes("-")) return false;
  return req
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== "*")
    .every((part) => {
      const match = /^(\^|~|=|>=|<=|>|<)?\s*(.+)$/.exec(part);
      if (match === null) throw new Error(`requirement ${req}`);
      const op = match[1] ?? "^";
      const pieces = (match[2] ?? "").split(".");
      const given = pieces.filter((piece) => piece !== "*" && piece !== "x").length;
      const [major = 0, minor = 0, patch = 0] = pieces.map((piece) => Number(piece) || 0);
      const low: Version = [major, minor, patch, (match[2] ?? "").split("-")[1] ?? ""];
      const at = (m: number, n: number, p: number): Version => [m, n, p, ""];
      let high: Version;
      if (op === "^") {
        if (major > 0 || given === 1) high = at(major + 1, 0, 0);
        else if (minor > 0 || given === 2) high = at(0, minor + 1, 0);
        else high = at(0, 0, patch + 1);
      } else if (op === "~" || (op === "=" && given < 3)) {
        high = given === 1 ? at(major + 1, 0, 0) : at(major, minor + 1, 0);
      } else if (op === "=") {
        return compare(version, low) === 0;
      } else {
        const order = compare(version, low);
        return op === ">="
          ? order >= 0
          : op === ">"
            ? order > 0
            : op === "<="
              ? order <= 0
              : order < 0;
      }
      return compare(version, low) >= 0 && compare(version, high) < 0;
    });
}

/** Cargo keeps one version per semver-compatible range of a crate. */
function bucket(versionText: string): string {
  const [major, minor, patch] = parseVersion(versionText);
  return major > 0 ? String(major) : minor > 0 ? `0.${String(minor)}` : `0.0.${String(patch)}`;
}

// ---- cfg() of a dependency's target, for wasm32-unknown-unknown ----

const targetValues: Readonly<Record<string, readonly string[]>> = {
  target_arch: ["wasm32"],
  target_family: ["wasm"],
  target_os: ["unknown", "none"],
  target_vendor: ["unknown"],
  target_env: [""],
  target_pointer_width: ["32"],
  target_endian: ["little"],
  panic: ["abort"],
};

function targetMatches(spec: string | null): boolean {
  if (spec === null) return true;
  if (!spec.startsWith("cfg(")) return spec === target;
  const tokens = spec.match(/"[^"]*"|[A-Za-z_][A-Za-z0-9_]*|[(),=]/g) ?? [];
  let at = 0;
  const next = (): string => tokens[at++] ?? "";
  const expression = (): boolean => {
    const word = next();
    if (word === "all" || word === "any" || word === "not") {
      next();
      const values: boolean[] = [];
      while (tokens[at] !== ")") {
        values.push(expression());
        if (tokens[at] === ",") at++;
      }
      next();
      if (word === "not") return !values[0];
      return word === "all" ? values.every(Boolean) : values.some(Boolean);
    }
    if (tokens[at] === "=") {
      next();
      const value = next().slice(1, -1);
      return targetValues[word]?.includes(value) ?? false;
    }
    return false;
  };
  next();
  next();
  return expression();
}

// ---- network ----

async function get(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok || attempt === 4) {
      if (!response.ok) throw new Error(`${url}: ${String(response.status)}`);
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
}

const indexCache = new Map<string, Promise<IndexEntry[]>>();
const datesCache = new Map<string, Promise<Map<string, number>>>();

function indexOf(name: string): Promise<IndexEntry[]> {
  let cached = indexCache.get(name);
  if (cached === undefined) {
    const lower = name.toLowerCase();
    const path =
      lower.length <= 2
        ? `${String(lower.length)}/${lower}`
        : lower.length === 3
          ? `3/${lower.slice(0, 1)}/${lower}`
          : `${lower.slice(0, 2)}/${lower.slice(2, 4)}/${lower}`;
    cached = get(`https://index.crates.io/${path}`)
      .then((response) => response.text())
      .then((text) =>
        text
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line) as IndexEntry),
      );
    indexCache.set(name, cached);
  }
  return cached;
}

/** Publication time of every version, from the crates.io API (one request a second, as it asks). */
function datesOf(name: string): Promise<Map<string, number>> {
  let cached = datesCache.get(name);
  if (cached === undefined) {
    cached = (async () => {
      const dates = new Map<string, number>();
      let page = `https://crates.io/api/v1/crates/${name}/versions?per_page=100`;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const body = (await (await get(page)).json()) as {
          versions: { num: string; created_at: string }[];
          meta: { next_page: string | null };
        };
        for (const version of body.versions) dates.set(version.num, Date.parse(version.created_at));
        if (body.meta.next_page === null) return dates;
        page = `https://crates.io/api/v1/crates/${name}/versions${body.meta.next_page}`;
      }
    })();
    datesCache.set(name, cached);
  }
  return cached;
}

const crateCache = new Map<string, Promise<CrateFiles>>();

/** The licence files, authors, licence and proc-macro flag of a published crate, from its `.crate` archive. */
function crateFiles(name: string, version: string): Promise<CrateFiles> {
  const key = `${name}@${version}`;
  let cached = crateCache.get(key);
  if (cached === undefined) {
    cached = (async () => {
      const response = await get(
        `https://static.crates.io/crates/${name}/${name}-${version}.crate`,
      );
      const files = untar(gunzipSync(Buffer.from(await response.arrayBuffer())));
      const root = `${name}-${version}/`;
      const manifest = files.get(`${root}Cargo.toml`) ?? "";
      const texts = [...files.entries()]
        .filter(([path]) => path.startsWith(root) && licenceFile.test(path.slice(root.length)))
        .filter(([path]) => !path.slice(root.length).includes("/"))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([path, text]) => ({ file: path.slice(root.length), text }));
      const authors = /^authors\s*=\s*\[([^\]]*)\]/m.exec(manifest)?.[1] ?? "";
      return {
        licence: /^license\s*=\s*"([^"]*)"/m.exec(manifest)?.[1] ?? "see the crate",
        authors: [...authors.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1] ?? ""),
        repository: /^repository\s*=\s*"([^"]*)"/m.exec(manifest)?.[1] ?? "",
        procMacro: /^\[lib\][^[]*^proc-macro\s*=\s*true/ms.test(manifest),
        texts,
      };
    })();
    crateCache.set(key, cached);
  }
  return cached;
}

function untar(archive: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let offset = 0;
  let longName: string | undefined;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number): string =>
      header.toString("utf8", start, start + length).replace(/\0.*$/s, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const body = archive.subarray(offset + 512, offset + 512 + size);
    const prefix = field(345, 155);
    let name = longName ?? (prefix === "" ? field(0, 100) : `${prefix}/${field(0, 100)}`);
    longName = undefined;
    if (type === "x") {
      longName = /\d+ path=([^\n]*)\n/.exec(body.toString("utf8"))?.[1];
    } else if (type === "L") {
      longName = body.toString("utf8").replace(/\0.*$/s, "");
    } else if (type === "0" || type === "") {
      name = name.replace(/^\.\//, "");
      files.set(name, body.toString("utf8"));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

// ---- resolution ----

function pinnedVersions(): Map<string, string[]> {
  const wasm = wasmText();
  const pins = new Map<string, string[]>();
  for (const match of wasm.matchAll(
    /registry\/src\/[^/]+\/([A-Za-z0-9_-]+?)-(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)\//g,
  )) {
    const [, name = "", version = ""] = match;
    const known = pins.get(name) ?? [];
    if (!known.includes(version)) pins.set(name, [...known, version]);
  }
  return pins;
}

function wasmText(): string {
  const require = createRequire(new URL("../../raster/package.json", import.meta.url));
  return readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")).toString("latin1");
}

/** Crates of the standard library std links on wasm32-unknown-unknown, with or without its default `backtrace`. */
const standardDeps = [
  "hashbrown",
  "compiler_builtins",
  "dlmalloc",
  "rustc-demangle",
  "cfg-if",
  "libc",
  "miniz_oxide",
  "adler",
  "addr2line",
  "gimli",
  "object",
];
const standardPathCrates = ["core", "alloc", "std", "panic_abort", "unwind", "std_detect"];

/**
 * The standard library of the rustc commit the binary names (`/rustc/<commit>/library/...`): its own crates under
 * rust-lang/rust's licence files at that commit, and its crates.io dependencies at the versions that commit's
 * Cargo.lock holds (the binary's `/rust/deps/<crate>-<version>/` paths must agree), each with its own licence files.
 */
async function standardLibrary(): Promise<
  { name: string; version: string; licence: string; texts: { file: string; text: string }[] }[]
> {
  const wasm = wasmText();
  const commit = /\/rustc\/([0-9a-f]{40})\//.exec(wasm)?.[1];
  if (commit === undefined) throw new Error("the binary names no rustc commit");
  const raw = (path: string): Promise<string> =>
    get(`https://raw.githubusercontent.com/rust-lang/rust/${commit}/${path}`).then((response) =>
      response.text(),
    );
  const release = (await raw("src/version")).trim();
  const lock = await raw("Cargo.lock");
  const texts = await Promise.all(
    ["COPYRIGHT", "LICENSE-APACHE", "LICENSE-MIT"].map(async (file) => ({
      file,
      text: await raw(file),
    })),
  );
  const version = `${release}-nightly (rustc ${commit.slice(0, 12)}, standard library)`;
  const rows = standardPathCrates.map((name) => ({
    name,
    version,
    licence: "MIT OR Apache-2.0",
    texts,
  }));
  const named = new Map(
    [...wasm.matchAll(/\/rust\/deps\/([A-Za-z0-9_-]+?)-(\d+\.\d+\.\d+)\//g)].map((match) => [
      match[1] ?? "",
      match[2] ?? "",
    ]),
  );
  for (const name of standardDeps) {
    const versions = [
      ...lock.matchAll(
        new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"`, "g"),
      ),
    ].map((match) => match[1] ?? "");
    const pick = named.get(name) ?? (versions.length === 1 ? versions[0] : undefined);
    if (pick === undefined || !versions.includes(pick)) {
      throw new Error(`no single ${name} version in the standard library's Cargo.lock`);
    }
    const files = await crateFiles(name, pick);
    rows.push({ name, version: pick, licence: files.licence, texts: [...files.texts] });
  }
  for (const name of named.keys()) {
    if (!standardDeps.includes(name)) throw new Error(`the binary names std dependency ${name}`);
  }
  return rows;
}

async function choose(
  requirement: Requirement,
  pins: Map<string, string[]>,
  nodes: Map<string, Node>,
): Promise<Node> {
  const entries = await indexOf(requirement.name);
  for (const node of nodes.values()) {
    if (node.name === requirement.name && satisfies(node.version, requirement.req)) return node;
  }
  const pinned = (pins.get(requirement.name) ?? []).find((version) =>
    satisfies(version, requirement.req),
  );
  let version = pinned;
  if (version === undefined) {
    // Yanked or not: a version yanked since (rgb 0.8.37, for one) was what cargo picked on the day.
    const matching = entries.filter((entry) => satisfies(entry.vers, requirement.req));
    const dates = matching.every((entry) => entry.pubtime !== undefined)
      ? new Map(matching.map((entry) => [entry.vers, Date.parse(entry.pubtime ?? "")]))
      : await datesOf(requirement.name);
    const candidates = matching
      .filter((entry) => (dates.get(entry.vers) ?? Infinity) <= cutoff)
      .sort((a, b) => compare(parseVersion(b.vers), parseVersion(a.vers)));
    version = candidates[0]?.vers;
  }
  const entry = entries.find((candidate) => candidate.vers === version);
  if (version === undefined || entry === undefined) {
    throw new Error(`no version of ${requirement.name} matches ${requirement.req}`);
  }
  const key = `${requirement.name}@${bucket(version)}`;
  const existing = nodes.get(key);
  if (existing !== undefined) return existing;
  const node: Node = {
    name: requirement.name,
    version,
    entry,
    features: new Set(),
    deps: new Set(),
  };
  nodes.set(key, node);
  return node;
}

/** Turns on features of a node and the optional dependencies they name; true when anything changed. */
function enable(node: Node, features: Iterable<string>): boolean {
  const table = { ...node.entry.features, ...node.entry.features2 };
  const optional = new Set(node.entry.deps.filter((d) => d.optional).map((d) => d.name));
  let changed = false;
  const pending = [...features];
  while (pending.length > 0) {
    const feature = pending.pop() ?? "";
    if (feature.startsWith("dep:")) {
      changed = add(node.deps, feature.slice(4)) || changed;
      continue;
    }
    const slash = feature.indexOf("/");
    if (slash > 0) {
      const name = feature.slice(0, slash).replace(/\?$/, "");
      if (!feature.slice(0, slash).endsWith("?")) changed = add(node.deps, name) || changed;
      changed = add(node.features, feature) || changed;
      continue;
    }
    if (node.features.has(feature)) continue;
    node.features.add(feature);
    changed = true;
    const implied = table[feature];
    if (implied !== undefined) pending.push(...implied);
    else if (optional.has(feature)) add(node.deps, feature);
  }
  return changed;
}

function add(set: Set<string>, value: string): boolean {
  if (set.has(value)) return false;
  set.add(value);
  return true;
}

async function resolve(): Promise<Node[]> {
  const pins = pinnedVersions();
  const nodes = new Map<string, Node>();
  const queue: Node[] = [];
  const queued = new Set<Node>();
  const demand = async (requirement: Requirement): Promise<void> => {
    const node = await choose(requirement, pins, nodes);
    const features = [...requirement.features, ...(requirement.defaultFeatures ? ["default"] : [])];
    if (enable(node, features) || !queued.has(node)) {
      queued.add(node);
      queue.push(node);
    }
  };
  for (const root of roots) await demand(root);
  const procMacros = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    if ((await crateFiles(node.name, node.version)).procMacro) {
      procMacros.add(`${node.name}@${node.version}`);
      continue;
    }
    for (const d of node.entry.deps) {
      if ((d.kind ?? "normal") !== "normal" || !targetMatches(d.target)) continue;
      if (d.optional && !node.deps.has(d.name)) continue;
      const forwarded = [...node.features]
        .filter((feature) => feature.replace("?", "").startsWith(`${d.name}/`))
        .map((feature) => feature.slice(feature.indexOf("/") + 1));
      await demand({
        name: d.package ?? d.name,
        req: d.req,
        features: [...d.features, ...forwarded],
        defaultFeatures: d.default_features,
      });
    }
  }
  return [...nodes.values()]
    .filter((node) => !procMacros.has(`${node.name}@${node.version}`))
    .sort((a, b) =>
      a.name === b.name
        ? compare(parseVersion(a.version), parseVersion(b.version))
        : a.name < b.name
          ? -1
          : 1,
    );
}

// ---- output ----

/** A licence template's holder placeholders filled with a crate's authors (only for texts the crate does not ship). */
function fillTemplate(text: string, authors: readonly string[] = []): string {
  const holders = authors.length === 0 ? "the crate's authors" : authors.join(", ");
  return text
    .replace(/<year>\s*<copyright holders>/g, holders)
    .replace(/<copyright holders>|<owner>|<organization>|<year>/g, holders);
}

async function main(): Promise<void> {
  const nodes = await resolve();
  const rows: {
    name: string;
    version: string;
    licence: string;
    texts: { file: string; text: string }[];
    note?: string;
    authors?: readonly string[];
  }[] = [];
  for (const node of nodes) {
    const files = await crateFiles(node.name, node.version);
    const holders =
      files.authors.length > 0
        ? files.authors
        : [`the authors of ${files.repository === "" ? node.name : files.repository}`];
    rows.push({
      name: node.name,
      version: node.version,
      licence: files.licence,
      texts: [...files.texts],
      ...(files.texts.length === 0
        ? {
            note: `ships no licence file; ${files.licence} applies; copyright holders: ${holders.join(", ")}`,
          }
        : {}),
      authors: holders,
    });
  }
  for (const crate of gitCrates) {
    const texts = await Promise.all(
      crate.files.map(async (url) => ({
        file: url.slice(url.lastIndexOf("/") + 1),
        text: await (await get(url)).text(),
      })),
    );
    rows.push({ name: crate.name, version: crate.version, licence: crate.licence, texts });
  }
  for (const row of await standardLibrary()) {
    if (!rows.some((known) => known.name === row.name && known.version === row.version))
      rows.push(row);
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const width = Math.max(...rows.map((row) => row.name.length));
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    for (const { file, text } of row.texts) {
      const normalized = text
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .trimEnd();
      const users = groups.get(normalized) ?? [];
      users.push(`${row.name} ${row.version} (${file})`);
      groups.set(normalized, users);
    }
  }
  const lines = [
    "Rust crates compiled into @resvg/resvg-wasm 2.6.2 (resvg.wasm), with their licences.",
    "",
    "Generated by packages/action/scripts/resvgCrates.ts: the crate graph of resvg-js 2.6.2 for wasm32 resolved as on",
    "2024-03-26 (its publication) with the versions the binary names pinned; build-time crates left out. Each crate's",
    "licence files follow the list, copied verbatim from its published .crate (or its git repository); a text several",
    "crates ship identically is printed once, naming them all. Where a crate offers a choice (A OR B), it is used under",
    "any of the licences whose text it ships. The Rust standard library the binary was built with (core, alloc, std",
    "and their runtime crates for wasm32, versions from that rustc commit's Cargo.lock) is listed too.",
    "",
    ...rows.map(
      (row) =>
        `${row.name.padEnd(width)}  ${row.version.padEnd(10)}  ${row.licence}${row.note === undefined ? "" : `  [${row.note}]`}`,
    ),
  ];
  for (const [text, users] of groups) {
    lines.push("", `----- ${users.join("; ")} -----`, "", text);
  }
  for (const row of rows.filter((candidate) => candidate.note !== undefined)) {
    lines.push(
      "",
      `----- ${row.name} ${row.version}: ships no licence file -----`,
      "",
      row.note ?? "",
    );
    for (const id of row.licence.split(/\s+OR\s+|\s+AND\s+|\//).map((part) => part.trim())) {
      const text = await (
        await get(`https://raw.githubusercontent.com/spdx/license-list-data/main/text/${id}.txt`)
      ).text();
      lines.push(
        "",
        `(SPDX ${id} text, not shipped by the crate; its copyright holders are the authors named above)`,
        "",
        fillTemplate(text.trimEnd(), row.authors),
      );
    }
  }
  writeFileSync(output, `${lines.join("\n")}\n`);
  console.log(`${String(rows.length)} crates, ${String(groups.size)} distinct licence texts`);
}

await main();
