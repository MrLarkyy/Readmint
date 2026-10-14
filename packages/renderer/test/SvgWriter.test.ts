import { expect, test } from "vitest";
import { fnv1a } from "../src/fnv1a.js";
import { SvgWriter } from "../src/SvgWriter.js";

const paragraph = (text: string) => (id: string) => `<p id="${id}">${text}</p>`;

function defsOf(writer: SvgWriter): string {
  return writer.finish("<svg>").svg.replace(/^<svg>(?:<defs>(.*)<\/defs>)?<\/svg>$/u, "$1");
}

/** The ids `share` hands out carry a placeholder for the document prefix, which `finish` fills in. */
const placeholder = "\u0001";
const documentPrefix = (svg: string) => /id="(d[0-9a-z]{7}-)/u.exec(svg)?.[1] ?? "";
const withPrefix = (text: string, prefix: string) => text.replaceAll(placeholder, prefix);

test("the same definition is written once, counted once and gets one id", () => {
  const writer = new SvgWriter(1000);
  const first = writer.share("g", paragraph("a"));
  const second = writer.share("g", paragraph("a"));
  expect(second).toBe(first);
  expect(first).toBe(`${placeholder}g${fnv1a('<p id="">a</p>')}`);
  const { svg, bytes } = writer.finish("<svg>");
  expect(svg).toBe(
    `<svg><defs><p id="${withPrefix(first, documentPrefix(svg))}">a</p></defs></svg>`,
  );
  expect(svg).not.toContain(placeholder);
  expect(bytes).toBe(svg.length);
});

test("different definitions get different ids, each written", () => {
  const writer = new SvgWriter(1000);
  const a = writer.share("g", paragraph("a"));
  const b = writer.share("g", paragraph("b"));
  const c = writer.share("c", paragraph("a"));
  expect(new Set([a, b, c]).size).toBe(3);
  expect(c).toBe(`${placeholder}c${a.slice(2)}`);
  const defs = defsOf(writer);
  const prefix = documentPrefix(defs);
  expect(defs).toBe(
    `<p id="${withPrefix(a, prefix)}">a</p><p id="${withPrefix(b, prefix)}">b</p><p id="${withPrefix(c, prefix)}">a</p>`,
  );
});

test("an id does not depend on the order definitions are asked for", () => {
  const forward = new SvgWriter(1000);
  const backward = new SvgWriter(1000);
  const texts = ["x", "y", "z"];
  const there = texts.map((text) => forward.share("g", paragraph(text)));
  const back = [...texts].reverse().map((text) => backward.share("g", paragraph(text)));
  expect(back.reverse()).toEqual(there);
});

test("a different definition with the same hash gets a suffix in request order", () => {
  // Found by brute force: these two keys have the same 32-bit FNV-1a.
  expect(fnv1a('<p id="">9pf8</p>')).toBe(fnv1a('<p id="">arj6</p>'));
  const writer = new SvgWriter(1000);
  const first = writer.share("g", paragraph("9pf8"));
  const second = writer.share("g", paragraph("arj6"));
  expect(second).toBe(`${first}-1`);
  expect(writer.share("g", paragraph("arj6"))).toBe(second);
  expect(writer.share("g", paragraph("9pf8"))).toBe(first);
  const defs = defsOf(writer);
  const prefix = documentPrefix(defs);
  expect(defs).toBe(
    `<p id="${withPrefix(first, prefix)}">9pf8</p><p id="${withPrefix(second, prefix)}">arj6</p>`,
  );
});

test("a shared definition over the budget stops the render at its first write", () => {
  const writer = new SvgWriter(10);
  expect(() => writer.share("i", paragraph("too long for ten bytes"))).toThrow(/passes 10 bytes/u);
});

test("the document prefix depends on the document and the budget applies to the replaced markup", () => {
  const make = (text: string, limit = 1000) => {
    const writer = new SvgWriter(limit);
    const id = writer.share("g", paragraph(text));
    writer.write(`<use href="#${id}"/>`);
    return writer;
  };
  const a = make("a").finish("<svg>");
  expect(documentPrefix(a.svg)).toBe(documentPrefix(make("a").finish("<svg>").svg));
  expect(documentPrefix(a.svg)).not.toBe(documentPrefix(make("b").finish("<svg>").svg));
  expect(a.bytes).toBe(a.svg.length);
  expect(() => make("a", a.bytes - 1).finish("<svg>")).toThrow(/passes/u);
});
