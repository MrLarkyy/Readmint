import { fnv1a } from "./fnv1a.js";
import { RenderFailure } from "./RenderFailure.js";
import { utf8Length } from "./utf8Length.js";

/** Stands for the document prefix in shared ids until `finish`; U+0001 is not an XML character, so no content has it. */
const MARK = "";

/**
 * Collects the SVG in three parts (style rules, definitions, body) and keeps a running UTF-8 size, so a render
 * stops as soon as it passes the output budget instead of building an unbounded string.
 *
 * Definitions shared by reference (gradients, clip paths, images) are written once per distinct markup under an id
 * derived from that markup, not from the order of use, and prefixed with a hash of the whole document (`finish`):
 * two different Readmint SVGs inlined into one page never share an id. Two byte-identical documents do share
 * their ids (a hidden copy of the same design), which is harmless as the definitions are equal.
 */
export class SvgWriter {
  private readonly styleParts: string[] = [];
  private readonly defParts: string[] = [];
  private readonly bodyParts: string[] = [];
  /** Letter -> markup of a shared definition without its id -> the id it was written under. */
  private readonly shared = new Map<string, Map<string, string>>();
  private readonly sharedIds = new Set<string>();
  private bytes = 0;
  private reserved = 0;

  constructor(readonly limit: number) {}

  /** Body markup, in drawing order. */
  write(markup: string): void {
    this.bodyParts.push(markup);
    this.count(markup);
  }

  /** An element inside `<defs>`. */
  define(markup: string): void {
    this.defParts.push(markup);
    this.count(markup);
  }

  /** A rule of the `<style>` element (already XML-escaped). */
  style(rule: string): void {
    this.styleParts.push(rule);
    this.count(rule);
  }

  /** Accounts for output that is certain to come (a lower bound), so huge expansions stop before they are built. */
  reserve(bytes: number): void {
    this.reserved += bytes;
    // Reservations happen while layers are resolved, before any of their markup is written, so the bytes written
    // so far (embedded fonts) and the reservations never count the same output twice.
    const total = this.reserved + this.bytes;
    if (total > this.limit) this.overflow(total);
  }

  /**
   * The id of a shared definition, written into `<defs>` (and counted) at its first request only. `build(id)` gives
   * the markup with that id; `build("")` is the key, so it must differ only in the id. The id is `letter` + the
   * hash of the key, behind the document prefix; a different key with the same hash in this document gets `-1`, `-2`, ... in request order.
   */
  share(letter: string, build: (id: string) => string): string {
    const key = build("");
    let ids = this.shared.get(letter);
    if (ids === undefined) {
      ids = new Map();
      this.shared.set(letter, ids);
    }
    const known = ids.get(key);
    if (known !== undefined) return known;
    const hashed = `${MARK}${letter}${fnv1a(key)}`;
    let id = hashed;
    for (let clash = 1; this.sharedIds.has(id); clash++) id = `${hashed}-${String(clash)}`;
    ids.set(key, id);
    this.sharedIds.add(id);
    this.define(build(id));
    return id;
  }

  /** The document: `open` (root start tag and leading children), definitions, body, closing tag. */
  finish(open: string): { svg: string; bytes: number } {
    const defs =
      this.styleParts.length + this.defParts.length === 0
        ? ""
        : `<defs>${this.styleParts.length === 0 ? "" : `<style>${this.styleParts.join("")}</style>`}${this.defParts.join("")}</defs>`;
    const marked = `${open}${defs}${this.bodyParts.join("")}</svg>`;
    const svg = marked.includes(MARK) ? marked.replaceAll(MARK, `d${fnv1a(marked)}-`) : marked;
    const bytes = utf8Length(svg);
    if (bytes > this.limit) this.overflow(bytes);
    return { svg, bytes };
  }

  private count(markup: string): void {
    this.bytes += utf8Length(markup);
    if (this.bytes > this.limit) this.overflow(this.bytes);
  }

  private overflow(bytes: number): never {
    throw new RenderFailure(
      "",
      "too-large",
      `the SVG passes ${String(this.limit)} bytes (reached ${String(bytes)} before stopping)`,
    );
  }
}
