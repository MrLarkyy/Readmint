export type JsonRecord = Readonly<Record<string, unknown>>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An own property only, so `__proto__`, `constructor` and inherited names read as absent. */
export function ownField(record: JsonRecord, name: string): unknown {
  return Object.hasOwn(record, name) ? record[name] : undefined;
}
