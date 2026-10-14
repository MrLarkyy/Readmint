import type { RenderAssets } from "@readmint/renderer";
import type { DesignArgs } from "./CliCommand.js";
import { loadDesignAssets } from "./loadDesignAssets.js";
import { type DesignFile, loadDesignFile } from "./loadDesignFile.js";
import { loadFixtureData } from "./loadFixtureData.js";

/** Everything one render needs, loaded the one way render, validate and preview share. */
export interface RenderInput {
  readonly file: DesignFile;
  readonly assets: RenderAssets;
  readonly data?: Record<string, unknown>;
}

export interface RenderInputOptions {
  readonly cwd: string;
  /** Called once the design file is valid, before its assets load (the preview watches them). */
  readonly onDesignFile?: (file: DesignFile) => void;
}

/** Design file, then its assets, then the fixture data; throws `CliError` at the first failure. */
export async function loadRenderInput(
  args: DesignArgs,
  options: RenderInputOptions,
): Promise<RenderInput> {
  const file = await loadDesignFile(args.design, {
    cwd: options.cwd,
    ...(args.root === undefined ? {} : { root: args.root }),
  });
  options.onDesignFile?.(file);
  const assets = await loadDesignAssets(file);
  if (args.data === undefined) return { file, assets };
  return { file, assets, data: await loadFixtureData(args.data, options.cwd) };
}
