/** Bounds applied to every render manifest before and while it is read. */
export const RenderManifestLimits = Object.freeze({
  /** Source text length in UTF-16 code units, checked before parsing. */
  maxSourceLength: 1_048_576,
  /** Entries of `renders`. */
  maxRenders: 64,
  /** Props of one entry. */
  maxPropsPerRender: 64,
  /** The props of one entry written as JSON, in UTF-16 code units. */
  maxPropsLength: 65_536,
  /** Characters of a design path. */
  maxDesignLength: 1024,
});

export type RenderManifestLimits = typeof RenderManifestLimits;
