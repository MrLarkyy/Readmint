/** Code-unit comparison: localeCompare would order names differently per runtime locale. */
export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
