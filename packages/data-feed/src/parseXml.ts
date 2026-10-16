import { DataSourceError } from "@readmint/data";
import { FeedLimits } from "./FeedSourceOptions.js";
import type { XmlElement, XmlNode } from "./XmlElement.js";

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
// A Map, not an object: a name such as `constructor` must not find a prototype member.
const PREDEFINED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["lt", "<"],
  ["gt", ">"],
  ["amp", "&"],
  ["quot", '"'],
  ["apos", "'"],
]);
/** Longest entity reference body between `&` and `;` (`#x10FFFF` is 8). */
const MAX_REFERENCE_LENGTH = 10;
const MAX_DECLARATION_LENGTH = 1024;
// Characters XML 1.0 forbids anywhere; a decoded string holds no lone surrogate.
// eslint-disable-next-line no-control-regex -- control characters are what is refused here
const FORBIDDEN_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/;
const NAME_PART = "[A-Za-z_\\u0080-\\uffff][A-Za-z0-9._\\-\\u0080-\\uffff]*";
const QUALIFIED_NAME = new RegExp(`^${NAME_PART}(?::${NAME_PART})?$`);
const ENCODING = /\bencoding\s*=\s*(["'])([A-Za-z][A-Za-z0-9._-]*)\1/;
const ACCEPTED_ENCODINGS = new Set(["utf-8", "utf8", "us-ascii", "ascii"]);

interface Frame {
  readonly qualifiedName: string;
  readonly bindings: ReadonlyMap<string, string> | null;
  readonly children: XmlNode[];
}

/**
 * Parses a decoded document into its root element in one forward pass with an explicit stack, so
 * no input can recurse or rescan. Strict and small on purpose: any DOCTYPE or other markup
 * declaration is refused, so no entity is ever declared or expanded; only the five predefined
 * entities and character references are read; the encoding must be UTF-8 (or ASCII). Depth,
 * element, attribute and name caps are `FeedLimits`. Errors are fixed text, never document text.
 */
export function parseXml(text: string, namespace: string): XmlElement {
  return new XmlParser(text, namespace).document();
}

class XmlParser {
  private position = 0;
  private elements = 0;
  private readonly stack: Frame[] = [];
  private root: XmlElement | null = null;

  constructor(
    private readonly text: string,
    private readonly source: string,
  ) {}

  document(): XmlElement {
    if (FORBIDDEN_CHARACTER.test(this.text)) {
      throw this.malformed("it holds a character XML does not allow");
    }
    this.declaration();
    const text = this.text;
    while (this.position < text.length) {
      const open = text.indexOf("<", this.position);
      if (open !== this.position) {
        const end = open === -1 ? text.length : open;
        this.characterData(text.slice(this.position, end));
        this.position = end;
      } else if (text.startsWith("<!--", open)) {
        this.position = this.after("-->", open + 4, "it has an unclosed comment");
      } else if (text.startsWith("<![CDATA[", open)) {
        this.cdata(open);
      } else if (text.startsWith("<!", open)) {
        throw new DataSourceError(
          this.source,
          "invalid-response",
          "The feed document has a DOCTYPE or another markup declaration; DTDs and entity declarations are refused.",
        );
      } else if (text.startsWith("<?", open)) {
        this.instruction(open);
      } else if (text.startsWith("</", open)) {
        this.endTag(open);
      } else {
        this.startTag(open);
      }
    }
    if (this.stack.length > 0) throw this.malformed("it ends inside an element");
    if (this.root === null) throw this.malformed("it has no root element");
    return this.root;
  }

  /** The XML declaration, if any; leading whitespace before it is tolerated (common in feeds). */
  private declaration(): void {
    const start = this.text.search(/\S/);
    if (start === -1 || !/^<\?xml[\s?]/.test(this.text.slice(start, start + 6))) return;
    const end = this.text.indexOf("?>", start);
    if (end === -1 || end - start > MAX_DECLARATION_LENGTH) {
      throw this.malformed("it has an unclosed XML declaration");
    }
    const encoding = ENCODING.exec(this.text.slice(start, end))?.[2]?.toLowerCase();
    if (encoding !== undefined && !ACCEPTED_ENCODINGS.has(encoding)) {
      throw new DataSourceError(
        this.source,
        "invalid-response",
        "The feed document declares an encoding other than UTF-8.",
      );
    }
    this.position = end + 2;
  }

  private characterData(raw: string): void {
    const frame = this.stack.at(-1);
    if (frame === undefined) {
      if (!/^[ \t\r\n]*$/.test(raw)) throw this.malformed("it has text outside the root element");
      return;
    }
    frame.children.push(this.decode(raw));
  }

  private cdata(open: number): void {
    const frame = this.stack.at(-1);
    if (frame === undefined)
      throw this.malformed("it has a CDATA section outside the root element");
    const end = this.text.indexOf("]]>", open + 9);
    if (end === -1) throw this.malformed("it has an unclosed CDATA section");
    frame.children.push(this.text.slice(open + 9, end));
    this.position = end + 3;
  }

  private instruction(open: number): void {
    this.position = open + 2;
    const target = this.name();
    if (target.toLowerCase() === "xml") {
      throw this.malformed("it has an XML declaration that is not at the start");
    }
    this.position = this.after("?>", this.position, "it has an unclosed processing instruction");
  }

  private endTag(open: number): void {
    this.position = open + 2;
    const name = this.name();
    this.skipSpace();
    if (this.text[this.position] !== ">") throw this.malformed("it has a malformed end tag");
    this.position += 1;
    const frame = this.stack.pop();
    if (frame?.qualifiedName !== name) throw this.malformed("it has mismatched tags");
  }

  private startTag(open: number): void {
    this.position = open + 1;
    const qualifiedName = this.name();
    const raw: [string, string][] = [];
    let selfClosing = false;
    for (;;) {
      const spaced = this.skipSpace();
      const char = this.text[this.position];
      if (char === ">") {
        this.position += 1;
        break;
      }
      if (char === "/" && this.text[this.position + 1] === ">") {
        this.position += 2;
        selfClosing = true;
        break;
      }
      if (char === undefined) throw this.malformed("it ends inside a tag");
      if (!spaced) throw this.malformed("it has a malformed start tag");
      const [name, value] = this.attribute();
      if (raw.some(([seen]) => seen === name)) throw this.malformed("it has a duplicate attribute");
      raw.push([name, value]);
      if (raw.length > FeedLimits.maxAttributes) {
        throw new DataSourceError(
          this.source,
          "too-large",
          `The feed document has an element with more than ${String(FeedLimits.maxAttributes)} attributes.`,
        );
      }
    }
    this.open(qualifiedName, raw, selfClosing);
  }

  private attribute(): [string, string] {
    const name = this.name();
    this.skipSpace();
    if (this.text[this.position] !== "=")
      throw this.malformed("it has an attribute without a value");
    this.position += 1;
    this.skipSpace();
    const quote = this.text[this.position];
    if (quote !== '"' && quote !== "'") throw this.malformed("it has an unquoted attribute value");
    const end = this.text.indexOf(quote, this.position + 1);
    if (end === -1) throw this.malformed("it ends inside an attribute value");
    const value = this.text.slice(this.position + 1, end);
    if (value.includes("<")) throw this.malformed("it has < in an attribute value");
    this.position = end + 1;
    // Attribute-value normalisation: literal tab, line feed and carriage return become spaces.
    return [name, this.decode(value.replace(/[\t\n\r]/g, " "))];
  }

  private open(
    qualifiedName: string,
    raw: readonly (readonly [string, string])[],
    selfClosing: boolean,
  ): void {
    this.elements += 1;
    if (this.elements > FeedLimits.maxElements) {
      throw new DataSourceError(
        this.source,
        "too-large",
        `The feed document holds more than ${String(FeedLimits.maxElements)} elements.`,
      );
    }
    if (this.stack.length + 1 > FeedLimits.maxDepth) {
      throw new DataSourceError(
        this.source,
        "too-large",
        `The feed document nests elements deeper than ${String(FeedLimits.maxDepth)} levels.`,
      );
    }
    const parent = this.stack.at(-1);
    if (parent === undefined && this.root !== null) {
      throw this.malformed("it has more than one root element");
    }
    const bindings = this.bindings(raw);
    const lookup = (prefix: string): string | undefined => this.lookup(prefix, bindings);
    const [prefix, local] = split(qualifiedName);
    const elementNamespace = lookup(prefix);
    if (elementNamespace === undefined) throw this.malformed("it uses an unbound namespace prefix");
    const attributes = new Map<string, string>();
    for (const [name, value] of raw) {
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      const [attributePrefix, attributeLocal] = split(name);
      let key = attributeLocal;
      if (attributePrefix !== "") {
        const uri = lookup(attributePrefix);
        if (uri === undefined) throw this.malformed("it uses an unbound namespace prefix");
        key = `{${uri}}${attributeLocal}`;
      }
      if (attributes.has(key)) throw this.malformed("it has a duplicate attribute");
      attributes.set(key, value);
    }
    const children: XmlNode[] = [];
    const element: XmlElement = { namespace: elementNamespace, name: local, attributes, children };
    if (parent === undefined) this.root = element;
    else parent.children.push(element);
    if (!selfClosing) this.stack.push({ qualifiedName, bindings, children });
  }

  private bindings(
    raw: readonly (readonly [string, string])[],
  ): ReadonlyMap<string, string> | null {
    let bindings: Map<string, string> | null = null;
    for (const [name, value] of raw) {
      let prefix: string;
      if (name === "xmlns") prefix = "";
      else if (name.startsWith("xmlns:")) prefix = name.slice(6);
      else continue;
      const reserved =
        prefix === "xmlns" ||
        value === XMLNS_NAMESPACE ||
        (prefix === "xml") !== (value === XML_NAMESPACE) ||
        (prefix !== "" && value === "");
      if (reserved) throw this.malformed("it declares a reserved or empty namespace prefix");
      bindings ??= new Map();
      bindings.set(prefix, value);
    }
    return bindings;
  }

  private lookup(prefix: string, own: ReadonlyMap<string, string> | null): string | undefined {
    if (prefix === "xml") return XML_NAMESPACE;
    const found = own?.get(prefix);
    if (found !== undefined) return found;
    for (let index = this.stack.length - 1; index >= 0; index -= 1) {
      const value = this.stack[index]?.bindings?.get(prefix);
      if (value !== undefined) return value;
    }
    return prefix === "" ? "" : undefined;
  }

  /** Reads a qualified name at the cursor, refusing a long one before scanning it all. */
  private name(): string {
    const start = this.position;
    const text = this.text;
    while (this.position < text.length && isNameChar(text.charCodeAt(this.position))) {
      this.position += 1;
      if (this.position - start > FeedLimits.maxNameLength) {
        throw new DataSourceError(
          this.source,
          "too-large",
          `The feed document has a name longer than ${String(FeedLimits.maxNameLength)} characters.`,
        );
      }
    }
    const name = text.slice(start, this.position);
    if (!QUALIFIED_NAME.test(name)) throw this.malformed("it has a missing or invalid name");
    return name;
  }

  /** Decodes the five predefined entities and character references; anything else is refused. */
  private decode(raw: string): string {
    if (!raw.includes("&")) return raw;
    const parts: string[] = [];
    let from = 0;
    for (;;) {
      const ampersand = raw.indexOf("&", from);
      if (ampersand === -1) break;
      parts.push(raw.slice(from, ampersand));
      let end = ampersand + 1;
      while (end < raw.length && end - ampersand <= MAX_REFERENCE_LENGTH && raw[end] !== ";") {
        end += 1;
      }
      if (raw[end] !== ";") throw this.malformed("it has an unterminated entity reference");
      parts.push(this.reference(raw.slice(ampersand + 1, end)));
      from = end + 1;
    }
    parts.push(raw.slice(from));
    return parts.join("");
  }

  private reference(body: string): string {
    if (body.startsWith("#")) {
      const digits = /^#(?:([0-9]{1,7})|x([0-9A-Fa-f]{1,6}))$/.exec(body);
      const code =
        digits === null
          ? Number.NaN
          : digits[1] !== undefined
            ? Number.parseInt(digits[1], 10)
            : Number.parseInt(digits[2] ?? "", 16);
      if (!isXmlChar(code)) throw this.malformed("it has an invalid character reference");
      return String.fromCodePoint(code);
    }
    const value = PREDEFINED_ENTITIES.get(body);
    if (value === undefined) {
      throw this.malformed("it uses an entity other than the five predefined ones");
    }
    return value;
  }

  private skipSpace(): boolean {
    const start = this.position;
    for (;;) {
      const code = this.text.charCodeAt(this.position);
      if (code !== 0x20 && code !== 0x9 && code !== 0xa && code !== 0xd) break;
      this.position += 1;
    }
    return this.position > start;
  }

  private after(marker: string, from: number, reason: string): number {
    const end = this.text.indexOf(marker, from);
    if (end === -1) throw this.malformed(reason);
    return end + marker.length;
  }

  private malformed(reason: string): DataSourceError {
    return new DataSourceError(
      this.source,
      "invalid-response",
      `The feed document is not well-formed XML: ${reason}.`,
    );
  }
}

function split(qualifiedName: string): [string, string] {
  const colon = qualifiedName.indexOf(":");
  return colon === -1
    ? ["", qualifiedName]
    : [qualifiedName.slice(0, colon), qualifiedName.slice(colon + 1)];
}

function isNameChar(code: number): boolean {
  return (
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x5f ||
    code === 0x2d ||
    code === 0x2e ||
    code === 0x3a ||
    code >= 0x80
  );
}

function isXmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}
