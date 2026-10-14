/** `record[key]` only when it is an own property, so a name such as `constructor` never reaches a prototype. */
export function ownEntry<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}
