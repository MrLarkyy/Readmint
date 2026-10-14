import { checkReferences } from "./checkReferences.js";
import type { Design } from "./Design.js";
import type { DesignResult } from "./DesignResult.js";
import { designSchemaV0 } from "./designSchemaV0.js";
import { IssueCollector } from "./IssueCollector.js";
import { measureValue } from "./measureValue.js";
import { migrateDesign } from "./migrateDesign.js";
import { validateNode } from "./schema/validateNode.js";

/**
 * Checks an already parsed design (the editor path): bounds, migration to the current version,
 * structure, then references. The returned value is the input itself unless a migration ran.
 */
export function validateDesign(value: unknown): DesignResult<Design> {
  const bounds = measureValue(value);
  if (bounds !== undefined) return { ok: false, issues: [bounds], truncated: false };
  const migrated = migrateDesign(value);
  if (!migrated.ok) return migrated;

  const issues = new IssueCollector();
  validateNode(designSchemaV0, designSchemaV0.root, migrated.value, "", issues);
  if (issues.isEmpty) checkReferences(migrated.value as unknown as Design, issues);
  if (!issues.isEmpty) return { ok: false, issues: issues.issues, truncated: issues.truncated };
  const design = migrated.value as unknown as Design;
  return migrated.migratedFrom === undefined
    ? { ok: true, value: design }
    : { ok: true, value: design, migratedFrom: migrated.migratedFrom };
}
