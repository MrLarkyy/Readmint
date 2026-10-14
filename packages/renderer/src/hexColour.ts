/** `#rrggbb` of the integer channels in 0..255 at the start of `value`. */
export function hexColour(value: readonly number[]): string {
  return `#${value
    .slice(0, 3)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}
