import { expect, test } from "vitest";
import { fnv1a } from "../src/fnv1a.js";
import { SvgWriter } from "../src/SvgWriter.js";

const paragraph = (text: string) => (id: string) => `<p id="${id}">${text}</p>`;

function defsOf(writer: SvgWriter): string {
  return writer.finish("<svg>").svg.replace(/^<svg>(?:<defs>(.*)<\/defs>)?<\/svg>$/u, "$1");
}

test("the same definition is written once, counted once and gets one id", () => {
  const writer = new SvgWriter(1000);
  const first = writer.share("g", paragraph("a"));
  const second = writer.share("g", paragraph("a"));
  expect(second).toBe(first);
  expect(first).toBe(`g${fnv1a('<p id="">a</p>')}`);
  const { svg, bytes } = writer.finish("<svg>");
  expect(svg).toBe(`<svg><defs><p id="${first}">a</p></defs></svg>`);
  expect(bytes).toBe(svg.length);
});

test("different definitions get different ids, each written", () => {
  const writer = new SvgWriter(1000);
  const a = writer.share("g", paragraph("a"));
  const b = writer.share("g", paragraph("b"));
  const c = writer.share("c", paragraph("a"));
  expect(new Set([a, b, c]).size).toBe(3);
  expect(c).toBe(`c${a.slice(1)}`);
  expect(defsOf(writer)).toBe(`<p id="${a}">a</p><p id="${b}">b</p><p id="${c}">a</p>`);
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
  expect(defsOf(writer)).toBe(`<p id="${first}">9pf8</p><p id="${second}">arj6</p>`);
});

test("a shared definition over the budget stops the render at its first write", () => {
  const writer = new SvgWriter(10);
  expect(() => writer.share("i", paragraph("too long for ten bytes"))).toThrow(/passes 10 bytes/u);
});
