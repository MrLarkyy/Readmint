import {
  applyDesignProps,
  applyRenderVariant,
  type ComponentPropValue,
  type DesignProps,
  type RenderVariant,
} from "@readmint/format";
import type { RenderAssets } from "@readmint/renderer";
import type { DesignArgs } from "./CliCommand.js";
import { checkDataNamespaces } from "./checkDataNamespaces.js";
import { CliError } from "./CliError.js";
import { ExitCode } from "./ExitCode.js";
import { fetchBoundImages } from "./fetchBoundImages.js";
import { isBoundSource } from "./isBoundSource.js";
import { loadDesignAssets } from "./loadDesignAssets.js";
import { type DesignFile, loadDesignFile } from "./loadDesignFile.js";
import { loadDesignProps } from "./loadDesignProps.js";
import { loadInputData } from "./loadInputData.js";
import { formatIssue } from "./formatIssue.js";
import { propsSection } from "./propsSection.js";
import { quoteForLog } from "./quoteForLog.js";
import type { RenderEntry } from "./RenderEntry.js";
import { RemoteImageError } from "./RemoteImageError.js";
import type { RemoteImageOptions } from "./RemoteImageOptions.js";
import { SettingsMask } from "./SettingsMask.js";

/** Everything one render needs, loaded the one way render, validate and preview share. */
export interface RenderInput {
  readonly file: DesignFile;
  readonly assets: RenderAssets;
  readonly data?: Record<string, unknown>;
  /** Present when the settings file set props of the design: every issue of its render passes through it. */
  readonly settingsMask?: SettingsMask;
  /** Notes for stderr or the log, never a value: a settings section overriding what the variant sets. */
  readonly warnings?: readonly string[];
}

export interface RenderInputOptions {
  readonly cwd: string;
  /** Render this variant of the design: its props are set before the settings section's. */
  readonly variant?: RenderVariant;
  /** Called once the design file is valid, before its assets load (the preview watches them). */
  readonly onDesignFile?: (file: DesignFile) => void;
  /** Settings the caller already loaded (the Action's); used instead of `args.props`. */
  readonly props?: DesignProps;
  /** Data the caller already loaded (the Action's); used instead of `args.data`. */
  readonly data?: Record<string, unknown>;
  /**
   * Loads the data once the design file and its assets are valid (`--github`, `--data-json`, `--data-feed`, `--data-wakatime`, `--data-registry`), when `data` is absent:
   * a broken design fails before any request. With `args.data` too, the fixture is read first and the loaded
   * namespaces are added to it (`mergeDataNamespaces`).
   */
  readonly loadData?: () => Promise<Record<string, unknown>>;
  /**
   * How images bound from data are fetched; absent, nothing is fetched and a design with one fails
   * `image-not-fetched` when there is data (without data its bytes stay missing and only a render fails).
   */
  readonly images?: RemoteImageOptions;
  /**
   * A render of a manifest: its props are set on the design before the variant, and its name is the settings
   * section instead of the design file's.
   */
  readonly entry?: RenderEntry;
}

/**
 * Design file, then its assets, then the data (given, or the fixture file and what `loadData` loads), then the
 * images bound from data; throws `CliError` at the first failure.
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
  const { entry } = options;
  const entered = entry === undefined ? loaded : withEntryProps(loaded, entry);
  const varied = options.variant === undefined ? entered : withVariant(entered, options.variant);
  const section = entry?.name ?? propsSection(loaded.name);
  const own = props !== undefined && Object.hasOwn(props, section) ? props[section] : undefined;
  const { file, mask } = withProps(varied, section, own, entry);
  const warnings = overrides(loaded.name, section, own, entry, options.variant);
  options.onDesignFile?.(file);
  const fileAssets = await loadDesignAssets(file);
  if (options.data === undefined) {
    checkDataNamespaces(
      file,
      args.dataJson ?? [],
      args.dataFeed ?? [],
      args.dataWakaTime ?? [],
      args.dataRegistry ?? [],
      args.github === true,
    );
  }
  const data = options.data ?? (await loadInputData(args, options));
  const assets = await withBoundImages(file, fileAssets, data, options.images);
  return {
    file,
    assets,
    ...(data === undefined ? {} : { data }),
    ...(mask === undefined ? {} : { settingsMask: mask }),
    ...(warnings.length === 0 ? {} : { warnings }),
  };
}

function withVariant(file: DesignFile, variant: RenderVariant): DesignFile {
  const result = applyRenderVariant(file.design, variant);
  if (result.ok) return { ...file, design: result.value };
  const lines = result.issues.map((issue) => formatIssue(file.name, issue, "error"));
  if (result.truncated) lines.push(`${file.name}: more issues not shown`);
  throw new CliError(ExitCode.invalid, lines);
}

function withEntryProps(file: DesignFile, entry: RenderEntry): DesignFile {
  if (Object.keys(entry.props).length === 0) return file;
  const result = applyDesignProps(file.design, entry.props);
  if (result.ok) return { ...file, design: result.value };
  const mask = new SettingsMask(entry.name, entry.props, file.design, renderLabel(entry));
  const lines = result.issues.map((issue) =>
    formatIssue(
      entry.manifest,
      mask.mask({ ...issue, path: `${entry.at}/props${issue.path}` }),
      "error",
    ),
  );
  if (result.truncated) lines.push(`${entry.manifest}: more issues not shown`);
  throw new CliError(ExitCode.invalid, lines);
}

function renderLabel(entry: RenderEntry): string {
  return `render ${quoteForLog(entry.name)}`;
}

/** Notes for the section that overrides what the variant or the manifest render set; names only. */
function overrides(
  fileName: string,
  section: string,
  own: Readonly<Record<string, unknown>> | undefined,
  entry: RenderEntry | undefined,
  variant: RenderVariant | undefined,
): string[] {
  if (own === undefined) return [];
  const notes: string[] = [];
  const sets = (name: string): boolean => Object.hasOwn(own, name);
  for (const name of Object.keys(entry?.props ?? {}).filter(sets)) {
    notes.push(
      `${fileName}: settings section ${quoteForLog(section)} sets ${quoteForLog(name)}, which overrides the props of render ${quoteForLog(section)}`,
    );
  }
  for (const name of Object.keys(variant?.props ?? {}).filter(sets)) {
    notes.push(
      `${fileName}: settings section ${quoteForLog(section)} sets ${quoteForLog(name)}, which overrides the ${variant?.name ?? ""} variant`,
    );
  }
  return notes;
}

function withProps(
  file: DesignFile,
  section: string,
  own: Readonly<Record<string, ComponentPropValue>> | undefined,
  entry: RenderEntry | undefined,
): { file: DesignFile; mask?: SettingsMask } {
  const label = entry === undefined ? undefined : renderLabel(entry);
  const entryProps = entry?.props ?? {};
  if (own === undefined || Object.keys(own).length === 0) {
    return Object.keys(entryProps).length === 0
      ? { file }
      : { file, mask: new SettingsMask(section, entryProps, file.design, label) };
  }
  const result = applyDesignProps(file.design, own);
  const merged = { ...entryProps, ...own };
  if (result.ok) {
    return {
      file: { ...file, design: result.value },
      mask: new SettingsMask(section, merged, result.value, label),
    };
  }
  // Issues outside the section's props (a merged value another check rejected) still must not quote a value.
  const mask = new SettingsMask(section, merged, file.design, label);
  const lines = result.issues.map((issue) =>
    formatIssue(file.name, mask.mask({ ...issue, path: `/${section}${issue.path}` }), "error"),
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
