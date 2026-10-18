const hex = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;

/** The `#rrggbb` a colour picker shows for a palette colour (#rgb, #rgba, #rrggbb or #rrggbbaa); black for anything else. */
export function pickerValue(colour: string): string {
  if (!hex.test(colour)) return "#000000";
  const digits = colour.slice(1).toLowerCase();
  if (digits.length <= 4) {
    return `#${digits.slice(0, 3).replace(/./gu, (digit) => digit + digit)}`;
  }
  return `#${digits.slice(0, 6)}`;
}

/** The colour a pick of `picked` (`#rrggbb`) makes of `old`: the old alpha digits are kept, written in full. */
export function withPicked(old: string, picked: string): string {
  const base = picked.toLowerCase();
  if (!hex.test(old)) return base;
  const digits = old.slice(1).toLowerCase();
  if (digits.length === 4) return `${base}${digits[3] ?? ""}${digits[3] ?? ""}`;
  if (digits.length === 8) return `${base}${digits.slice(6)}`;
  return base;
}
