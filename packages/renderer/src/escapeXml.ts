import { stripXmlInvalid } from "./stripXmlInvalid.js";

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

/**
 * Text content of an element. Every string from a design or from data passes through here or `escapeAttribute`,
 * so characters XML does not allow are removed here (`stripXmlInvalid`) before the specials become entities.
 */
export function escapeText(text: string): string {
  return stripXmlInvalid(text).replace(specials, replace);
}

/** A double-quoted attribute value, without the characters XML does not allow. */
export function escapeAttribute(value: string): string {
  return stripXmlInvalid(value).replace(specials, replace);
}
