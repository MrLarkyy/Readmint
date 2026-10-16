import { applyDesignProps, type DesignProps } from "@readmint/format";
import type { RenderAssets } from "@readmint/renderer";
import type { DesignArgs } from "./CliCommand.js";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { fetchBoundImages } from "./fetchBoundImages.js";
import { isBoundSource } from "./isBoundSource.js";
import { loadDesignAssets } from "./loadDesignAssets.js";
import { type DesignFile, loadDesignFile } from "./loadDesignFile.js";
import { loadDesignProps } from "./loadDesignProps.js";
import { loadFixtureData } from "./loadFixtureData.js";
import { formatIssue } from "./formatIssue.js";
import { propsSection } from "./propsSection.js";
import { settingsPointers } from "./settingsPointers.js";
import { quoteForLog } from "./quoteForLog.js";
import { RemoteImageError } from "./RemoteImageError.js";
import type { RemoteImageOptions } from "./RemoteImageOptions.js";

/** Everything one render needs, loaded the one way render, validate and preview share. */
export interface RenderInput {
  readonly file: DesignFile;
  readonly assets: RenderAssets;
  readonly data?: Record<string, unknown>;
  /** Pointers of the design props that came from the settings file: their issue messages must not quote them. */
  readonly settingsPointers?: readonly string[];
}

export interface RenderInputOptions {
  readonly cwd: string;
  /** Called once the design file is valid, before its assets load (the preview watches them). */
  readonly onDesignFile?: (file: DesignFile) => void;
  /** Settings the caller already loaded (the Action's); used instead of `args.props`. */
  readonly props?: DesignProps;
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
  const loaded = await loadDesignFile(args.design, {
    cwd: options.cwd,
    ...(args.root === undefined ? {} : { root: args.root }),
  });
  const props =
    options.props ??
    (args.props === undefined ? undefined : await loadDesignProps(args.props, options.cwd));
  const { file, pointers } =
    props === undefined ? { file: loaded, pointers: [] } : withProps(loaded, props);
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
  return {
    file,
    assets,
    ...(data === undefined ? {} : { data }),
    ...(pointers.length === 0 ? {} : { settingsPointers: pointers }),
  };
}

function withProps(file: DesignFile, props: DesignProps): { file: DesignFile; pointers: string[] } {
  const section = propsSection(file.name);
  const own = Object.hasOwn(props, section) ? props[section] : undefined;
  if (own === undefined) return { file, pointers: [] };
  const result = applyDesignProps(file.design, own);
  if (result.ok) {
    return {
      file: { ...file, design: result.value },
      pointers: settingsPointers(result.value, own),
    };
  }
  const lines = result.issues.map((issue) =>
    formatIssue(file.name, { ...issue, path: `/${section}${issue.path}` }, "error"),
  );
  if (result.truncated) lines.push(`${file.name}: more issues not shown`);
  throw new CliError(ExitCode.invalid, lines);
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
