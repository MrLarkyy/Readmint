/**
 * One step of the format's migration chain. `migrate` receives a private deep copy of a document
 * at version `from` (it may mutate it) and returns the document at `to`; the chain sets `version`.
 */
export interface DesignMigration {
  readonly from: number;
  /** Always `from + 1`: the chain is contiguous. */
  readonly to: number;
  migrate(document: Record<string, unknown>): Record<string, unknown>;
}
