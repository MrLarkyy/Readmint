import { RenderFailure } from "./RenderFailure.js";
import { utf8Length } from "./utf8Length.js";

/**
 * Collects the SVG in three parts (style rules, definitions, body) and keeps a running UTF-8 size, so a render
 * stops as soon as it passes the output budget instead of building an unbounded string. Ids are allocated per
 * writer, that is per render, in creation order.
 */
export class SvgWriter {
  private readonly styleParts: string[] = [];
  private readonly defParts: string[] = [];
  private readonly bodyParts: string[] = [];
  private readonly counters = new Map<string, number>();
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

  /** `prefix` + the next number for that prefix: `g0`, `g1`, ... */
  id(prefix: string): string {
    const next = this.counters.get(prefix) ?? 0;
    this.counters.set(prefix, next + 1);
    return `${prefix}${String(next)}`;
  }

  /** The document: `open` (root start tag and leading children), definitions, body, closing tag. */
  finish(open: string): { svg: string; bytes: number } {
    const defs =
      this.styleParts.length + this.defParts.length === 0
        ? ""
        : `<defs>${this.styleParts.length === 0 ? "" : `<style>${this.styleParts.join("")}</style>`}${this.defParts.join("")}</defs>`;
    const svg = `${open}${defs}${this.bodyParts.join("")}</svg>`;
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
