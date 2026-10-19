export const packageName = "@readmint/cli";

export { AssetPathError, type AssetPathErrorCode } from "./AssetPathError.js";
export { checkAssetPath } from "./checkAssetPath.js";
export type { CliCommand, DesignArgs, ManifestRenderArgs, RenderArgs } from "./CliCommand.js";
export type { DesignProps, RenderVariant } from "@readmint/format";
export { applyRenderVariant, renderVariant, renderVariants } from "@readmint/format";
export { CliError } from "./CliError.js";
export type { CliIo } from "./CliIo.js";
export { escapeForLog } from "./escapeForLog.js";
export { fetchBoundImages } from "./fetchBoundImages.js";
export { ExitCode } from "./ExitCode.js";
export { formatIssue } from "./formatIssue.js";
export { loadDesignAssets } from "./loadDesignAssets.js";
export { loadDesignFile, type DesignFile, type DesignFileOptions } from "./loadDesignFile.js";
export { type DesignPropsOptions, loadDesignProps } from "./loadDesignProps.js";
export { loadFixtureData, maxFixtureBytes } from "./loadFixtureData.js";
export { loadFeedArgs, type FeedArgsOptions } from "./loadFeedArgs.js";
export { loadJsonArgs, type JsonArgsOptions } from "./loadJsonArgs.js";
export { loadRegistryArgs, type RegistryArgsOptions } from "./loadRegistryArgs.js";
export { loadWakaTimeArgs, type WakaTimeArgsOptions } from "./loadWakaTimeArgs.js";
export { checkDataNamespaces } from "./checkDataNamespaces.js";
export { checkFixtureNamespaces, mergeDataNamespaces } from "./mergeDataNamespaces.js";
export { type DataFeedSpec, maxDataFeedSources, parseDataFeedArgs } from "./parseDataFeedArgs.js";
export { type DataJsonSpec, maxDataJsonSources, parseDataJsonArgs } from "./parseDataJsonArgs.js";
export {
  type DataRegistrySpec,
  maxDataRegistrySources,
  parseDataRegistryArgs,
} from "./parseDataRegistryArgs.js";
export {
  type DataWakaTimeSpec,
  maxDataWakaTimeSources,
  parseDataWakaTimeArgs,
} from "./parseDataWakaTimeArgs.js";
export { partialDataWarning } from "./partialDataWarning.js";
export { registryMissingWarning } from "./registryMissingWarning.js";
export { wakaTimePartialWarning } from "./wakaTimePartialWarning.js";
export {
  loadLiveData,
  type LiveDataOptions,
  liveDataTimeoutMs,
  liveDataTimeoutPerCommitMs,
  liveDataAuthoredMarginMs,
  liveDataTimeout,
} from "./loadLiveData.js";
export { loadRenderInput, type RenderInput, type RenderInputOptions } from "./loadRenderInput.js";
export {
  type LoadedRenderEntry,
  type LoadedRenderManifest,
  loadRenderManifest,
  type RenderManifestOptions,
} from "./loadRenderManifest.js";
export { localeProblem } from "./localeProblem.js";
export { type OutputFormat, outputExtension, outputFormats } from "./OutputFormat.js";
export { type PictureEntry, pictureHtml } from "./pictureHtml.js";
export { propsSection } from "./propsSection.js";
export { quoteForLog } from "./quoteForLog.js";
export { readAsset, readResolvedAsset, type AssetReadLimits } from "./readAsset.js";
export { redactSecrets } from "./redactSecrets.js";
export { RemoteImageError, type RemoteImageErrorCode } from "./RemoteImageError.js";
export {
  defaultImageHosts,
  type ImageFetch,
  type RemoteImageCache,
  RemoteImageLimits,
  type RemoteImageOptions,
} from "./RemoteImageOptions.js";
export { designNameIn } from "./designNameIn.js";
export { renderLabel } from "./renderLabel.js";
export { type RenderEntry } from "./RenderEntry.js";
export { relabelLine } from "./relabelLine.js";
export { renderInput } from "./renderInput.js";
export {
  type RenderedOutput,
  renderOutput,
  type RenderOutputOptions,
  type RenderOutputResult,
} from "./renderOutput.js";
export { resolveAsset, type ResolvedAsset } from "./resolveAsset.js";
export { runCli } from "./runCli.js";
