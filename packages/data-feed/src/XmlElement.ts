/** An element of a parsed document; namespaces are resolved, prefixes are gone. */
export interface XmlElement {
  /** Namespace URI, `""` when the element is in none. */
  readonly namespace: string;
  /** Local name. */
  readonly name: string;
  /**
   * Attributes without the namespace declarations: an unprefixed one by its name, a prefixed one
   * as `{<namespace URI>}<local name>`.
   */
  readonly attributes: ReadonlyMap<string, string>;
  /** Child elements and text (entities decoded, CDATA as text), in document order. */
  readonly children: readonly XmlNode[];
}

export type XmlNode = XmlElement | string;
