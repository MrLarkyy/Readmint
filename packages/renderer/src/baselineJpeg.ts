import type { Bytes } from "./Bytes.js";
import { skipEntropyData } from "./skipEntropyData.js";

/*
 * Baseline (SOF0) Huffman tables: past a baseline frame header jpeg-decoder 0.3.1 takes only tables 0 and 1, in a DHT
 * (parser.rs:544) or a scan header (parser.rs:374-378), and resvg draws the image empty; libjpeg reads tables 0-3 and
 * Chromium draws it. Before the frame header jpeg-decoder takes any table.
 */

const baselineTable = (table: number, where: string) =>
  `JPEG baseline (SOF0) ${where} Huffman table ${String(table)}, which is refused, because resvg draws it empty; ` +
  "baseline allows tables 0 and 1";

/** Why the DHT segment at `offset` (its length field) after a baseline frame header is refused, or undefined. */
export function baselineTablesProblem(
  bytes: Bytes,
  offset: number,
  length: number,
): string | undefined {
  let at = offset + 2;
  while (at < offset + length) {
    const table = bytes.u8(at) & 0x0f;
    if (table > 1) return baselineTable(table, "defines, after its frame header,");
    let codes = 0;
    for (let bits = 1; bits <= 16; bits++) codes += bytes.u8(at + bits);
    at += 17 + codes;
  }
  return undefined;
}

/**
 * Why a baseline file is refused from its first scan header at `offset` (its length field) on, or undefined: that
 * scan, then up to EOI every later DHT and scan header, the image data skipped in one pass (restart markers included,
 * a DRI being legal) and any other segment by its length. Several scans are legal. Where the data runs out, or a
 * segment length is below 2, the walk ends without a problem, as decoders read the image up to there.
 */
export function baselineScansProblem(bytes: Bytes, offset: number): string | undefined {
  let scan = offset;
  for (;;) {
    const scanProblem = baselineScanProblem(bytes, scan);
    if (scanProblem !== undefined) return scanProblem;
    let next = skipEntropyData(bytes.data, scan + bytes.u16be(scan), true);
    while (next !== undefined && next.marker !== 0xda) {
      if (next.marker === 0xd9) return undefined;
      const length = bytes.u16be(next.offset);
      if (length < 2) return undefined;
      if (next.marker === 0xc4) {
        const tablesProblem = baselineTablesProblem(bytes, next.offset, length);
        if (tablesProblem !== undefined) return tablesProblem;
      }
      next = skipEntropyData(bytes.data, next.offset + length, true);
    }
    if (next === undefined) return undefined;
    scan = next.offset;
  }
}

function baselineScanProblem(bytes: Bytes, offset: number): string | undefined {
  const count = bytes.u8(offset + 2);
  for (let index = 0; index < count; index++) {
    const tables = bytes.u8(offset + 4 + 2 * index);
    const table = Math.max(tables >> 4, tables & 0x0f);
    if (table > 1) return baselineTable(table, "scan selects");
  }
  return undefined;
}
