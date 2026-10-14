import type { DesignIssue } from "./DesignIssue.js";
import type { DesignMigration } from "./DesignMigration.js";
import type { DesignResult } from "./DesignResult.js";
import { cloneJson } from "./cloneJson.js";
import { DESIGN_FORMAT_VERSION, designMigrations } from "./designMigrations.js";
import { isPlainObject } from "./isPlainObject.js";
import { measureValue } from "./measureValue.js";

export interface MigrateDesignOptions {
  readonly migrations?: readonly DesignMigration[];
  /** Version to migrate to; defaults to `DESIGN_FORMAT_VERSION`. */
  readonly target?: number;
}

/**
 * Brings a document to `target` through the contiguous migration chain. The caller's object is
 * never mutated: migrations run on a deep copy, and an up-to-date document is returned as is.
 */
export function migrateDesign(
  value: unknown,
  options: MigrateDesignOptions = {},
): DesignResult<Record<string, unknown>> {
  const migrations = options.migrations ?? designMigrations;
  const target = options.target ?? DESIGN_FORMAT_VERSION;
  if (!isPlainObject(value)) return failure("", "type", "expected a design object");
  if (!Object.hasOwn(value, "version"))
    return failure("/version", "missing-property", 'missing required property "version"');
  const version = value["version"];
  if (typeof version !== "number" || !Number.isInteger(version))
    return failure("/version", "type", "expected an integer version");
  if (version > target)
    return failure(
      "/version",
      "unsupported-version",
      `version ${String(version)} is newer than supported ${String(target)}`,
    );
  if (version < 0)
    return failure("/version", "unsupported-version", `version ${String(version)} does not exist`);
  if (version === target) return { ok: true, value };

  const bounds = measureValue(value);
  if (bounds !== undefined) return { ok: false, issues: [bounds], truncated: false };
  let document = cloneJson(value);
  for (let from = version; from < target; from++) {
    const step = migrations.find(
      (migration) => migration.from === from && migration.to === from + 1,
    );
    if (step === undefined)
      return failure(
        "/version",
        "migration-missing",
        `no migration from version ${String(from)} to ${String(from + 1)}`,
      );
    document = step.migrate(document);
    if (!isPlainObject(document))
      throw new Error(`migration ${String(from)} -> ${String(from + 1)} returned no object`);
    Object.defineProperty(document, "version", {
      value: from + 1,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return { ok: true, value: document, migratedFrom: version };
}

function failure(
  path: string,
  code: DesignIssue["code"],
  message: string,
): DesignResult<Record<string, unknown>> {
  return { ok: false, issues: [{ path, code, message }], truncated: false };
}
