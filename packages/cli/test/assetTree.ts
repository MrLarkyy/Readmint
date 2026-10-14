import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "vitest";

/** A temporary folder for one test; `root` is as os.tmpdir() spells it (maybe a short 8.3 path). */
export interface AssetTree {
  readonly root: string;
  readonly design: string;
  /** Writes a file below `root`, creating its folders. */
  file(relative: string, content?: string | Uint8Array): Promise<string>;
  /** The real path of a file or folder below `root`, as resolveAsset reports it. */
  real(relative: string): Promise<string>;
  remove(): Promise<void>;
}

export async function makeAssetTree(): Promise<AssetTree> {
  const root = await mkdtemp(join(tmpdir(), "readmint-asset-"));
  const design = join(root, "design");
  await mkdir(design);
  return {
    root,
    design,
    async file(relative, content = "x") {
      const path = join(root, relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      return path;
    },
    real: (relative) => realpath(join(root, relative)),
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

/** A directory link: a junction on Windows (no privilege needed), a symlink elsewhere. */
export async function linkDirectory(target: string, link: string): Promise<void> {
  await symlink(target, link, "junction");
}

/**
 * A file symlink. Windows without Developer Mode refuses it with EPERM: only then is the test
 * skipped; on every other platform and for any other error the test fails.
 */
export async function linkFile(context: TestContext, target: string, link: string): Promise<void> {
  try {
    await symlink(target, link, "file");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (process.platform === "win32" && (code === "EPERM" || code === "EACCES")) {
      context.skip("file symlinks need Developer Mode or admin rights on Windows");
    }
    throw error;
  }
}
