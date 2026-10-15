import type { RenderAssets } from "@readmint/renderer";
import type { DesignArgs } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { fetchBoundImages } from "./fetchBoundImages.js";
import { isBoundSource } from "./isBoundSource.js";
import { loadDesignAssets } from "./loadDesignAssets.js";
import { type DesignFile, loadDesignFile } from "./loadDesignFile.js";
import { loadFixtureData } from "./loadFixtureData.js";
import { quoteForLog } from "./quoteForLog.js";
import { RemoteImageError } from "./RemoteImageError.js";
import type { RemoteImageOptions } from "./RemoteImageOptions.js";

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
  /** Data the caller already loaded (the Action's); used instead of `args.data`. */
  readonly data?: Record<string, unknown>;
  /**
   * Loads the data once the design file and its assets are valid (`--github`), used instead of `args.data` when
   * `data` is absent: a broken design fails before any request.
   */
  readonly loadData?: () => Promise<Record<string, unknown>>;
  /**
   * How images bound from data are fetched; absent, nothing is fetched and a design with one fails
   * `image-not-fetched` when there is data (without data its bytes stay missing and only a render fails).
   */
  readonly images?: RemoteImageOptions;
}

/**
 * Design file, then its assets, then the data (given, loaded by `loadData`, or the fixture file), then the images
 * bound from data; throws `CliError` at the first failure.
 */
export async function loadRenderInput(
  args: DesignArgs,
  options: RenderInputOptions,
): Promise<RenderInput> {
  const file = await loadDesignFile(args.design, {
    cwd: options.cwd,
    ...(args.root === undefined ? {} : { root: args.root }),
  });
  options.onDesignFile?.(file);
  const fileAssets = await loadDesignAssets(file);
  const data =
    options.data ??
    (options.loadData === undefined
      ? args.data === undefined
        ? undefined
        : await loadFixtureData(args.data, options.cwd)
      : await options.loadData());
  const assets = await withBoundImages(file, fileAssets, data, options.images);
  return data === undefined ? { file, assets } : { file, assets, data };
}

async function withBoundImages(
  file: DesignFile,
  assets: RenderAssets,
  data: Readonly<Record<string, unknown>> | undefined,
  images: RemoteImageOptions | undefined,
): Promise<RenderAssets> {
  const [first] = Object.keys(file.design.assets?.images ?? {})
    .filter((id) => isBoundSource(file.design.assets?.images?.[id]?.src ?? ""))
    .sort();
  if (first === undefined) return assets;
  try {
    if (images === undefined) {
      // Without data there is nothing to bind (validate only checks): the renderer names --fetch-images if it renders.
      if (data === undefined) return assets;
      throw new RemoteImageError(
        "image-not-fetched",
        `image asset ${quoteForLog(first)} takes its src from data; pass --fetch-images to fetch it`,
        first,
      );
    }
    const fetched = await fetchBoundImages(file.design, data, images);
    return { ...assets, images: { ...assets.images, ...fetched } };
  } catch (error) {
    if (!(error instanceof RemoteImageError)) throw error;
    const id = error.asset ?? "";
    const at = `/assets/images/${id.replaceAll("~", "~0").replaceAll("/", "~1")}/src`;
    throw new CliError(
      ExitCode.invalid,
      `${file.name}: error ${error.code} at ${at}: ${error.message}`,
      { cause: error },
    );
  }
}
