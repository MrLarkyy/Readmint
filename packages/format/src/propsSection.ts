/** The settings section a design file takes: its base name without `.json`, `.yaml`, `.yml` and a trailing `.dark`. */
export function propsSection(fileName: string): string {
  const base = fileName.slice(fileName.lastIndexOf("/") + 1);
  const stem = base.replace(/\.(?:json|ya?ml)$/iu, "");
  return stem.replace(/(?<=.)\.dark$/iu, "");
}
