export const packageName = "@readmint/data-registry";

export type { MavenArtifact, NpmPackage, RegistryData } from "./RegistryData.js";
export type {
  RegistryFetch,
  RegistryLoadMeta,
  RegistrySourceOptions,
} from "./RegistrySourceOptions.js";
export { REGISTRY_DATA_DEFAULT_NAMESPACE, REGISTRY_DATA_VERSION } from "./RegistryData.js";
export { RegistryLimits } from "./RegistrySourceOptions.js";
export { isMavenCoordinate } from "./isMavenCoordinate.js";
export { isNpmPackageName } from "./isNpmPackageName.js";
export { REGISTRY_HOSTS } from "./registryUrls.js";
export { registryDataSource } from "./registryDataSource.js";
export { loadRegistryData } from "./loadRegistryData.js";
