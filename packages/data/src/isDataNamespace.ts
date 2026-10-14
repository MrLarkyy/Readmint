const NAMESPACE = /^[a-z][a-z0-9]{0,31}$/;
const RESERVED = new Set(["true", "false", "null"]);

/** True when `name` is always a valid expression root: lowercase letters and digits, no hyphen. */
export function isDataNamespace(name: unknown): name is string {
  return typeof name === "string" && NAMESPACE.test(name) && !RESERVED.has(name);
}
