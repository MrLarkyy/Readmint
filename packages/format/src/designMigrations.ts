import type { DesignMigration } from "./DesignMigration.js";

/** The version this package reads and validates; documents carry it in `version`. */
export const DESIGN_FORMAT_VERSION = 0;

/** Every released step from an older version to `DESIGN_FORMAT_VERSION`; none exist for v0. */
export const designMigrations: readonly DesignMigration[] = Object.freeze([]);
