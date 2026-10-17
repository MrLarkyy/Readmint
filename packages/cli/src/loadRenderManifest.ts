import path from "node:path";
import {
  type ComponentPropValue,
  type DesignIssue,
  parseRenderManifest,
  type RenderVariant,
  RenderManifestLimits,
} from "@readmint/format";
import { AssetPathError } from "./AssetPathError.js";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { quoteForLog } from "./quoteForLog.js";
import { readConfinedFile } from "./readConfinedFile.js";
import { readUserFile } from "./readUserFile.js";
import { resolveAsset } from "./resolveAsset.js";

// Every UTF-16 unit of the largest source the format takes is at most 3 UTF-8 bytes; plus a byte order mark.
const maxManifestBytes = 3 * RenderManifestLimits.maxSourceLength + 3;

/** `confinedTo`: a folder the manifest must stay inside (relative path, links resolved), as the Action's `manifest`. */
export interface RenderManifestOptions {
  readonly confinedTo?: string;
  /** The run's variant (`--variant`, the Action's `variant`): the variant of every render that lists none. */
  readonly variant?: RenderVariant;
}

/** One render of a loaded manifest. */
export interface LoadedRenderEntry {
  readonly name: string;
  /** The design file, relative to the working folder and `/`-separated: pass it with `folder` as the root. */
  readonly design: string;
  readonly props: Readonly<Record<string, ComponentPropValue>>;
  /** The variants rendered next to the light output: the render's own, else the run's, else none. */
  readonly variants: readonly RenderVariant[];
  /** Pointer of the entry in the manifest (`/renders/<i>`). */
  readonly at: string;
}

export interface LoadedRenderManifest {
  /** The manifest as messages name it: `manifest "<file>"`. */
  readonly label: string;
  /** The manifest's folder, relative to the working folder and `/`-separated (`.` for the folder itself). */
  readonly folder: string;
  readonly renders: readonly LoadedRenderEntry[];
}

const reasons: Record<string, string> = {
  "not-found": "does not exist",
  "not-a-file": "is not a regular file",
  outside: "resolves outside the manifest folder",
  unreadable: "cannot be read",
};

/**
 * Reads a render manifest (`render --manifest`, the Action's `manifest`): JSON, parsed by `parseRenderManifest`, and
 * checks that every design file exists inside the manifest's folder (links resolved). Throws `CliError`: exit code 3
 * when the manifest cannot be read or a design is missing or outside the folder, 1 when the content is invalid; a
 * message names the manifest and the pointer, never a prop value.
 */
export async function loadRenderManifest(
  manifestPath: string,
  cwd: string,
  options?: RenderManifestOptions,
): Promise<LoadedRenderManifest> {
  const label = `manifest ${quoteForLog(manifestPath)}`;
  const bytes =
    options?.confinedTo === undefined
      ? await readUserFile("manifest", manifestPath, cwd, maxManifestBytes)
      : await readConfinedFile("manifest", manifestPath, options.confinedTo, maxManifestBytes);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CliError(ExitCode.invalid, `${label}: error parse at /: not valid UTF-8`);
  }
  const result = parseRenderManifest(source);
  if (!result.ok) {
    const lines = result.issues.map((issue) => formatIssue(label, issue, "error"));
    if (result.truncated) lines.push(`${label}: more issues not shown`);
    throw new CliError(ExitCode.invalid, lines);
  }
  const folderPath = path.resolve(cwd, path.dirname(manifestPath));
  const relativeFolder = path.relative(path.resolve(cwd), folderPath).split(path.sep).join("/");
  const folder = relativeFolder === "" ? "." : relativeFolder;
  const renders: LoadedRenderEntry[] = [];
  const problems: string[] = [];
  const clashes: string[] = [];
  for (const [index, entry] of result.value.renders.entries()) {
    const at = `/renders/${String(index)}`;
    const fault = await designFault(folderPath, entry.design);
    if (fault !== undefined) {
      problems.push(formatIssue(label, { ...fault, path: `${at}/design` }, "error"));
      continue;
    }
    const variants = entry.variants ?? (options?.variant === undefined ? [] : [options.variant]);
    for (const variant of variants) {
      for (const prop of Object.keys(variant.props)) {
        if (!Object.hasOwn(entry.props, prop)) continue;
        // The parse-time rule for the variants a render lists, applied to the run's variant too.
        const issue: DesignIssue = {
          path: `${at}/props/${prop}`,
          code: "duplicate-key",
          message: `the prop ${prop} is also set by the ${variant.name} variant; set it in one place`,
        };
        clashes.push(formatIssue(label, issue, "error"));
      }
    }
    renders.push({
      name: entry.name,
      design: folder === "." ? entry.design : `${folder}/${entry.design}`,
      props: entry.props,
      variants,
      at,
    });
  }
  if (problems.length > 0) throw new CliError(ExitCode.input, problems);
  if (clashes.length > 0) throw new CliError(ExitCode.invalid, clashes);
  return { label, folder, renders };
}

async function designFault(
  folder: string,
  design: string,
): Promise<Omit<DesignIssue, "path"> | undefined> {
  try {
    await resolveAsset(folder, design);
    return undefined;
  } catch (error) {
    if (!(error instanceof AssetPathError)) throw error;
    return {
      code: "unknown-reference",
      message: `design file ${quoteForLog(design)} ${reasons[error.code] ?? `is not an allowed path (${error.code})`}`,
    };
  }
}
