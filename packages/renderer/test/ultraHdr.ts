import { app2, inserted } from "./colourImages.js";

const text = (value: string): number[] => Array.from(value, (char) => char.charCodeAt(0));
const u16le = (value: number): number[] => [value & 255, (value >>> 8) & 255];
const u32le = (value: number): number[] => [...u16le(value & 0xffff), ...u16le(value >>> 16)];

/** A JPEG APP1 XMP segment holding `packet`, marker included. */
export function xmpSegment(packet: string): number[] {
  const signature = "http://ns.adobe.com/xap/1.0/\0";
  const length = 2 + signature.length + packet.length;
  return [0xff, 0xe1, length >> 8, length & 255, ...text(signature + packet)];
}

const description = (attributes: string, children: string): string =>
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  `<rdf:Description ${attributes}>${children}</rdf:Description></rdf:RDF></x:xmpmeta>`;

const hdrgm = 'xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0"';

/** The APP2 MPF segment of a two-image file: version, image count and the two MP entries, as CIPA DC-007 lays them out. */
function mpfSegment(primaryLength: number, gainMapLength: number, gainMapOffset: number): number[] {
  const entry = (attribute: number, size: number, offset: number) => [
    ...u32le(attribute),
    ...u32le(size),
    ...u32le(offset),
    0,
    0,
    0,
    0,
  ];
  const tag = (id: number, type: number, count: number, value: number[]) => [
    ...u16le(id),
    ...u16le(type),
    ...u32le(count),
    ...value,
  ];
  const entriesAt = 8 + 2 + 3 * 12 + 4;
  return app2("MPF\0", [
    ...text("II*\0"),
    ...u32le(8),
    ...u16le(3),
    ...tag(0xb000, 7, 4, text("0100")),
    ...tag(0xb001, 4, 1, u32le(2)),
    ...tag(0xb002, 7, 32, u32le(entriesAt)),
    ...u32le(0),
    ...entry(0x20030000, primaryLength, 0),
    ...entry(0, gainMapLength, gainMapOffset),
  ]);
}

/**
 * An Ultra HDR v1 file built from the JPEG `base` as its primary and as its gain map, as libultrahdr lays one out
 * (an assembled test fixture, not an encoder's output): the primary carries the Google container directory and
 * `hdrgm` version in XMP, the ISO 21496-1 APP2 and the MPF index, the gain map JPEG (its own `hdrgm` XMP) follows the
 * primary's EOI. `primary` is the first image alone.
 */
export function ultraHdrJpeg(base: Uint8Array): {
  readonly data: Uint8Array;
  readonly primary: Uint8Array;
} {
  const gainMap = inserted(base, 2, xmpSegment(description(hdrgm, "")));
  const container =
    'xmlns:Container="http://ns.google.com/photos/1.0/container/" xmlns:Item="http://ns.google.com/photos/1.0/container/item/"';
  const directory =
    '<Container:Directory><rdf:Seq><rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="Primary" Item:Mime="image/jpeg"/></rdf:li>' +
    `<rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="GainMap" Item:Mime="image/jpeg" Item:Length="${String(gainMap.length)}"/></rdf:li></rdf:Seq></Container:Directory>`;
  const iso = app2("urn:iso:std:iso:ts:21496:-1\0", [0, 0, 0, 0, 1, 2, 3, 4]);
  const leading = [...xmpSegment(description(`${container} ${hdrgm}`, directory)), ...iso];
  const mpfLength = mpfSegment(0, 0, 0).length;
  const primaryLength = base.length + leading.length + mpfLength;
  const headerAt = 2 + leading.length + 2 + 2 + 4;
  const mpf = mpfSegment(primaryLength, gainMap.length, primaryLength - headerAt);
  const primary = inserted(base, 2, [...leading, ...mpf]);
  return { data: new Uint8Array([...primary, ...gainMap]), primary };
}
