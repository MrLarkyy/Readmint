const specials = /[&<>"']/gu;

const entities: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function replace(char: string): string {
  return entities[char] ?? char;
}

/** Text content of an element. Every string from a design or from data passes through here or `escapeAttribute`. */
export function escapeText(text: string): string {
  return text.replace(specials, replace);
}

/** A double-quoted attribute value. */
export function escapeAttribute(value: string): string {
  return value.replace(specials, replace);
}
