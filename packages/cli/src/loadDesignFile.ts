import path from "node:path";
import { type Design, DesignLimits, parseDesign } from "@readmint/format";
import { AssetPathError, type AssetPathErrorCode } from "./AssetPathError.js";
import { CliError } from "./CliError.js";
import { errnoCode } from "./errnoCode.js";
import { ExitCode } from "./ExitCode.js";
import { formatIssue } from "./formatIssue.js";
import { quoteForLog } from "./quoteForLog.js";
import { readResolvedAsset } from "./readAsset.js";
import { resolveAsset } from "./resolveAsset.js";

/** A design file read and validated. */
export interface DesignFile {
  readonly design: Design;
  /** Real path of the folder holding the design file: its assets resolve against it. */
  readonly designDir: string;
  /** Real path of the design file. */
  readonly path: string;
  /** The design file relative to the root folder, `/`-separated: how messages name it. */
  readonly name: string;
}

export interface DesignFileOptions {
  /** Folder the design file must lie in, relative to `cwd`; default `cwd`. */
  readonly root?: string;
  readonly cwd: string;
}

// Every UTF-16 unit of the largest source the format takes is at most 3 UTF-8 bytes; plus a byte order mark.
const maxDesignBytes = 3 * DesignLimits.maxSourceLength + 3;

const reasons: Partial<Record<AssetPathErrorCode, string>> = {
  "not-found": "does not exist",
  "not-a-file": "is not a regular file",
  outside: "resolves outside the root folder",
  unreadable: "cannot be read",
  changed: "changed while it was being read",
  "too-large": `is larger than ${String(maxDesignBytes)} bytes`,
};

/**
 * Reads the design file through `resolveAsset` inside the root folder, so a design reached through
 * a link in an untrusted checkout cannot move the asset boundary out of it. Throws `CliError`.
 */
export async function loadDesignFile(
  designPath: string,
  options: DesignFileOptions,
): Promise<DesignFile> {
  const root = path.resolve(options.cwd, options.root ?? ".");
  const relative = path.relative(root, path.resolve(options.cwd, designPath));
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new CliError(ExitCode.input, "the design file is outside the root folder; pass --root");
  }
  const name = relative.split(path.sep).join("/");
  const { bytes, realPath } = await readDesignBytes(root, name);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CliError(ExitCode.invalid, `${name}: error parse at /: the file is not valid UTF-8`);
  }
  const extension = path.extname(name).toLowerCase();
  const format =
    extension === ".json"
      ? "json"
      : extension === ".yaml" || extension === ".yml"
        ? "yaml"
        : undefined;
  const result = parseDesign(source, format === undefined ? {} : { format });
  if (!result.ok) {
    const lines = result.issues.map((issue) => formatIssue(name, issue, "error"));
    if (result.truncated) lines.push(`${name}: more issues not shown`);
    throw new CliError(ExitCode.invalid, lines);
  }
  return { design: result.value, designDir: path.dirname(realPath), path: realPath, name };
}

async function readDesignBytes(
  root: string,
  name: string,
): Promise<{ bytes: Uint8Array; realPath: string }> {
  try {
    const resolved = await resolveAsset(root, name);
    const bytes = await readResolvedAsset(resolved, { maxBytes: maxDesignBytes });
    return { bytes, realPath: resolved.path };
  } catch (error) {
    if (error instanceof AssetPathError) {
      const reason = reasons[error.code] ?? `is not an allowed path (${error.code})`;
      const exitCode = error.code === "too-large" ? ExitCode.invalid : ExitCode.input;
      throw new CliError(exitCode, `design file ${quoteForLog(name)} ${reason}`, { cause: error });
    }
    const code = errnoCode(error);
    if (code === undefined) throw error;
    throw new CliError(ExitCode.input, `the root folder cannot be opened (${code})`, {
      cause: error,
    });
  }
}
