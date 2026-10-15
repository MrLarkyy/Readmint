const entities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Text or an attribute value of XML with its entity and character references resolved. */
export function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-z]+);/g, (whole, name: string) => {
    if (!name.startsWith("#")) return entities[name] ?? whole;
    const code = name.startsWith("#x") ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
  });
}

/** A double-quoted XML attribute value. */
export function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
