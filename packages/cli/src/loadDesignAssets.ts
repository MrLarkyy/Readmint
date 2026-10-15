import type { RenderAssets } from "@readmint/renderer";
import { RenderLimits } from "@readmint/renderer";
import { AssetPathError } from "./AssetPathError.js";
import { CliError } from "./CliError.js";
import { errnoCode } from "./errnoCode.js";
import { ExitCode } from "./ExitCode.js";
import { isBoundSource } from "./isBoundSource.js";
import type { DesignFile } from "./loadDesignFile.js";
import { readResolvedAsset } from "./readAsset.js";
import { resolveAsset } from "./resolveAsset.js";

type AssetKind = "fonts" | "images";

const maxBytes: Readonly<Record<AssetKind, number>> = {
  fonts: RenderLimits.maxFontBytes,
  images: RenderLimits.maxImageBytes,
};

/**
 * Reads every asset of the design whose `src` is a path, used or not, through `readAsset` with the
 * renderer's per-kind byte limit; `data:` sources are left to the renderer, `{{binding}}` ones to
 * `fetchBoundImages`. Fonts first, then images, ids in sorted order. Assets of one kind that
 * resolve to the same real path (however the path is spelled: `a.ttf`, `./a.ttf`, a symlink)
 * share one read and one array, so the renderer decodes a font once; not device and inode, which
 * some file systems report as 0 for every file. A refusal throws `CliError` (exit code 1) naming
 * the asset.
 */
export async function loadDesignAssets(file: DesignFile): Promise<RenderAssets> {
  return {
    fonts: await loadKind(file, "fonts"),
    images: await loadKind(file, "images"),
  };
}

async function loadKind(file: DesignFile, kind: AssetKind): Promise<Record<string, Uint8Array>> {
  const declared = file.design.assets?.[kind] ?? {};
  const entries: [string, Uint8Array][] = [];
  const read = new Map<string, Uint8Array>();
  for (const id of Object.keys(declared).sort()) {
    const src = declared[id]?.src;
    if (src === undefined || src.startsWith("data:") || isBoundSource(src)) continue;
    try {
      const resolved = await resolveAsset(file.designDir, src);
      const bytes =
        read.get(resolved.path) ??
        (await readResolvedAsset(resolved, { maxBytes: maxBytes[kind] }));
      read.set(resolved.path, bytes);
      entries.push([id, bytes]);
    } catch (error) {
      if (!(error instanceof AssetPathError)) throw folderError(file, error);
      const at = `/assets/${kind}/${id.replaceAll("~", "~0").replaceAll("/", "~1")}/src`;
      throw new CliError(ExitCode.invalid, `${file.name}: error asset at ${at}: ${error.message}`, {
        cause: error,
      });
    }
  }
  return Object.fromEntries(entries);
}

// resolveAsset lets errors on the design folder itself through; their Node message holds its absolute path.
function folderError(file: DesignFile, error: unknown): unknown {
  const code = errnoCode(error);
  if (code === undefined) return error;
  return new CliError(
    ExitCode.input,
    `${file.name}: the design folder cannot be opened (${code})`,
    {
      cause: error,
    },
  );
}
