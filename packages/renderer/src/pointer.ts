/** RFC 6901: `key` appended to `parent` with `~` and `/` escaped. */
export function pointer(parent: string, key: string | number): string {
  const token =
    typeof key === "number" ? String(key) : key.replaceAll("~", "~0").replaceAll("/", "~1");
  return `${parent}/${token}`;
}
