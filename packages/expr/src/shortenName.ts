/** Names come from the design, never from the data; long ones are clipped to keep messages short. */
export function shortenName(name: string): string {
  return name.length > 32 ? `${name.slice(0, 31)}…` : name;
}
