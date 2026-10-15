/**
 * Variants of the test JPEG (32x16, baseline: SOI, APP0, APP2, DQT x2, SOF0, DHT x4, SOS) with one marker added or
 * patched, built from the bytes passed in so the Node and the browser test project share them.
 */
export interface JpegVariant {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** Measured: Chromium and resvg-wasm 2.6.2 both draw it flat grey 128 (the built multi-scan file). */
  readonly drawsGrey?: true;
}

export interface RefusedJpeg extends JpegVariant {
  /** A part of the sniffer's message. */
  readonly message: string;
  /**
   * Chromium draws it at 0x0 (the default). False where Chromium draws it and only resvg draws nothing (RSTn, TEM, DNL,
   * DAC, a segment length below 2). SOF5, C8, SOF13 and 16-bit samples are patched onto baseline Huffman data, so
   * Chromium refuses them as unsupported headers, which a genuine file of that kind may not share.
   */
  readonly chromiumDrawsNothing: boolean;
  /** Measured: resvg-wasm 2.6.2 draws nothing where Chromium draws the picture (a Huffman table above 1 in SOF0). */
  readonly resvgDrawsNothing?: true;
}

interface Layout {
  /** Offset of the SOF0 marker. */
  readonly frame: number;
  /** Offset just past the SOF0 segment. */
  readonly frameEnd: number;
  /** Offset of the SOS marker. */
  readonly scan: number;
  /** AC Huffman table 0 as a DHT stores it, after its class and id byte: 16 code counts, then the values. */
  readonly acTable: readonly number[];
}

function layout(jpeg: Uint8Array): Layout {
  if (jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) {
    throw new Error("the test JPEG does not end with EOI");
  }
  let offset = 2;
  let frame: Pick<Layout, "frame" | "frameEnd"> | undefined;
  let acTable: number[] | undefined;
  for (;;) {
    const marker = jpeg[offset + 1];
    const length = ((jpeg[offset + 2] ?? 0) << 8) | (jpeg[offset + 3] ?? 0);
    if (marker === undefined) throw new Error("the test JPEG has no SOS");
    if (marker === 0xc0) frame = { frame: offset, frameEnd: offset + 2 + length };
    if (marker === 0xc4) acTable ??= huffmanTable(jpeg, offset + 4, offset + 2 + length, 0x10);
    if (marker === 0xda) {
      if (frame === undefined || acTable === undefined)
        throw new Error("the test JPEG lacks SOF0 or AC table 0");
      return { ...frame, scan: offset, acTable };
    }
    offset += 2 + length;
  }
}

/** The table `id` (class and destination) among the DHT tables from `start` up to `end`. */
function huffmanTable(
  jpeg: Uint8Array,
  start: number,
  end: number,
  id: number,
): number[] | undefined {
  for (let at = start; at < end;) {
    const counts = [...jpeg.subarray(at + 1, at + 17)];
    const size = 17 + counts.reduce((sum, count) => sum + count, 0);
    if (jpeg[at] === id) return [...jpeg.subarray(at + 1, at + size)];
    at += size;
  }
  return undefined;
}

/** A DHT segment holding the test JPEG's AC table 0 as AC table 2. */
const acTable2 = (acTable: readonly number[]) => [
  0xff,
  0xc4,
  0,
  acTable.length + 3,
  0x12,
  ...acTable,
];

const segment = (marker: number, body: readonly number[]) => [
  0xff,
  marker,
  (body.length + 2) >> 8,
  (body.length + 2) & 0xff,
  ...body,
];

/**
 * A baseline 32x16 JPEG of three non-interleaved scans (components 1 2 3 at 1x1), a restart interval of 2 blocks (so
 * RST0-RST2 inside each scan) and a COM before EOI, built here as no encoder at hand writes one: one-code Huffman
 * tables (DC category 0 is `0`, AC EOB is `0`), every block DC 0 and EOB, so it is flat grey 128 (RM-54 probe
 * derive3.mjs: Chromium and resvg-wasm draw it so). `dht` is added before the frame header; `secondScan` is the
 * second scan's table selector byte.
 */
function threeScans(options: { dht?: readonly number[]; secondScan?: number } = {}): Uint8Array {
  const oneCode = (id: number) => [id, 1, ...new Array<number>(15).fill(0), 0];
  // Four intervals of two blocks of 2 bits, each padded with 1 bits to a byte.
  const data = [0x0f, 0xff, 0xd0, 0x0f, 0xff, 0xd1, 0x0f, 0xff, 0xd2, 0x0f];
  const scan = (id: number, tables = 0) => [...segment(0xda, [1, id, tables, 0, 63, 0]), ...data];
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
    ...(options.dht ?? []),
    ...segment(0xc0, [8, 0, 16, 0, 32, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]),
    ...segment(0xc4, [...oneCode(0x00), ...oneCode(0x10)]),
    ...segment(0xdd, [0, 2]),
    ...scan(1),
    ...scan(2, options.secondScan),
    ...scan(3),
    ...segment(0xfe, [0x68, 0x69]),
    0xff,
    0xd9,
  ]);
}

/** The one-code AC table of `threeScans` as AC table 2. */
const oneCodeAcTable2 = segment(0xc4, [0x12, 1, ...new Array<number>(15).fill(0), 0]);

function inserted(jpeg: Uint8Array, at: number, insert: readonly number[]): Uint8Array {
  const result = new Uint8Array(jpeg.length + insert.length);
  result.set(jpeg.subarray(0, at), 0);
  result.set(insert, at);
  result.set(jpeg.subarray(at), at + insert.length);
  return result;
}

function patched(jpeg: Uint8Array, at: number, value: number): Uint8Array {
  const result = jpeg.slice();
  result[at] = value;
  return result;
}

/** The test JPEG with its frame header of type `marker`. */
const frameType = (jpeg: Uint8Array, marker: number) =>
  patched(jpeg, layout(jpeg).frame + 1, marker);

/** The JPEGs the sniffer refuses, each with a marker libjpeg rejects or resvg draws empty before its image data. */
export function refusedJpegs(jpeg: Uint8Array): RefusedJpeg[] {
  const { frame, frameEnd, scan, acTable } = layout(jpeg);
  const before = (insert: readonly number[]) => inserted(jpeg, frame, insert);
  // The first scan component's selector byte (DC table, AC table) set to AC table 2.
  const scanOnAc2 = inserted(
    patched(jpeg, scan + 6, ((jpeg[scan + 6] ?? 0) & 0xf0) | 2),
    frame,
    acTable2(acTable),
  );
  const after = (insert: readonly number[]) => inserted(jpeg, frameEnd, insert);
  const lengthPlusOne = inserted(
    patched(jpeg, frame + 3, (jpeg[frame + 3] ?? 0) + 1),
    frameEnd,
    [0],
  );
  // Length 8 and no component: the precision and size kept, the component count 0.
  const noComponents = new Uint8Array([
    ...jpeg.subarray(0, frame + 2),
    0,
    8,
    ...jpeg.subarray(frame + 4, frame + 9),
    0,
    ...jpeg.subarray(frameEnd),
  ]);
  const refused = (name: string, bytes: Uint8Array, message: string, drawsNothing = true) => ({
    name,
    bytes,
    message,
    chromiumDrawsNothing: drawsNothing,
  });
  return [
    refused("a second SOI before the frame header", before([0xff, 0xd8]), "second start-of-image"),
    refused("a second SOI after the frame header", after([0xff, 0xd8]), "second start-of-image"),
    refused("FF 02 before the frame header", before([0xff, 0x02, 0, 2]), "unknown marker 0x02"),
    refused("FF 02 after the frame header", after([0xff, 0x02, 0, 2]), "unknown marker 0x02"),
    refused("FF DE (DHP) after the frame header", after([0xff, 0xde, 0, 2]), "unknown marker 0xDE"),
    refused(
      "FF F0 (JPG0) after the frame header",
      after([0xff, 0xf0, 0, 2]),
      "unknown marker 0xF0",
    ),
    refused("FF BF after the frame header", after([0xff, 0xbf, 0, 2]), "unknown marker 0xBF"),
    refused("EOI after the frame header", after([0xff, 0xd9]), "ends before its image data"),
    refused(
      "a second frame header",
      after([...jpeg.subarray(frame, frameEnd)]),
      "second frame header",
    ),
    refused("RST0 before the frame header", before([0xff, 0xd0]), "marker 0xD0", false),
    refused("RST0 after the frame header", after([0xff, 0xd0]), "marker 0xD0", false),
    refused("TEM before the frame header", before([0xff, 0x01]), "marker 0x01", false),
    refused("TEM after the frame header", after([0xff, 0x01]), "marker 0x01", false),
    refused("DAC before the frame header", before([0xff, 0xcc, 0, 2]), "marker 0xCC", false),
    refused("DAC after the frame header", after([0xff, 0xcc, 0, 2]), "marker 0xCC", false),
    refused("DNL after the frame header", after([0xff, 0xdc, 0, 4, 0, 16]), "marker 0xDC", false),
    refused("APP15 of length 0", before([0xff, 0xef, 0, 0]), "segment 0xEF length", false),
    refused(
      "COM of length 1 after the frame header",
      after([0xff, 0xfe, 0, 1]),
      "segment 0xFE length",
      false,
    ),
    refused("SOF5 (differential)", frameType(jpeg, 0xc5), "frame type 0xC5"),
    refused("JPG (0xC8)", frameType(jpeg, 0xc8), "frame type 0xC8"),
    refused("SOF13 (arithmetic differential)", frameType(jpeg, 0xcd), "frame type 0xCD"),
    refused("16-bit samples", patched(jpeg, frame + 4, 16), "precision of 16 bits"),
    refused("a frame header one byte too long", lengthPlusOne, "frame header length is invalid"),
    refused("a frame header without components", noComponents, "frame header length is invalid"),
    {
      ...refused("a scan on AC table 2", scanOnAc2, "scan selects Huffman table 2", false),
      resvgDrawsNothing: true,
    },
    {
      ...refused(
        "a DHT of table 2 after the frame header",
        inserted(jpeg, scan, acTable2(acTable)),
        "defines, after its frame header, Huffman table 2",
        false,
      ),
      resvgDrawsNothing: true,
    },
    {
      ...refused(
        "a DHT of table 2 before EOI",
        inserted(jpeg, jpeg.length - 2, acTable2(acTable)),
        "defines, after its frame header, Huffman table 2",
        false,
      ),
      resvgDrawsNothing: true,
    },
    {
      ...refused(
        "a later scan on AC table 2",
        threeScans({ dht: oneCodeAcTable2, secondScan: 0x02 }),
        "scan selects Huffman table 2",
        false,
      ),
      resvgDrawsNothing: true,
    },
  ];
}

/** The JPEGs the sniffer accepts at 32x16: markers both libjpeg and resvg read on. */
export function acceptedJpegs(jpeg: Uint8Array): JpegVariant[] {
  const { frame, frameEnd, acTable } = layout(jpeg);
  return [
    { name: "the test JPEG", bytes: jpeg },
    {
      name: "COM before the frame header",
      bytes: inserted(jpeg, frame, [0xff, 0xfe, 0, 4, 0x68, 0x69]),
    },
    {
      name: "DRI after the frame header",
      bytes: inserted(jpeg, frameEnd, [0xff, 0xdd, 0, 4, 0, 0]),
    },
    { name: "SOF1 (extended sequential)", bytes: frameType(jpeg, 0xc1) },
    {
      name: "a DHT of table 2 before the frame header",
      bytes: inserted(jpeg, frame, acTable2(acTable)),
    },
    {
      name: "a COM before EOI",
      bytes: inserted(jpeg, jpeg.length - 2, [0xff, 0xfe, 0, 4, 0x68, 0x69]),
    },
    {
      name: "three scans with restart markers and a COM before EOI",
      bytes: threeScans(),
      drawsGrey: true,
    },
    {
      name: "three scans, AC table 2 defined before the frame header but unused",
      bytes: threeScans({ dht: oneCodeAcTable2 }),
      drawsGrey: true,
    },
  ];
}
