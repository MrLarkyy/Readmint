/**
 * Variants of the test JPEG (32x16, baseline: SOI, APP0, APP2, DQT x2, SOF0, DHT x4, SOS) with one marker added or
 * patched, built from the bytes passed in so the Node and the browser test project share them.
 */
export interface JpegVariant {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface RefusedJpeg extends JpegVariant {
  /** A part of the sniffer's message. */
  readonly message: string;
  /**
   * Chromium draws it at 0x0. False where the variant is no genuine file of its kind (a frame type or precision
   * patched onto baseline Huffman data), so what Chromium makes of it says nothing about a real one, or where
   * Chromium draws it and only resvg draws nothing (RSTn, TEM, DNL, DAC, a segment length below 2).
   */
  readonly chromiumDrawsNothing: boolean;
}

interface Layout {
  /** Offset of the SOF0 marker. */
  readonly frame: number;
  /** Offset just past the SOF0 segment. */
  readonly frameEnd: number;
}

function layout(jpeg: Uint8Array): Layout {
  let offset = 2;
  for (;;) {
    const marker = jpeg[offset + 1];
    const length = ((jpeg[offset + 2] ?? 0) << 8) | (jpeg[offset + 3] ?? 0);
    if (marker === undefined || marker === 0xda) throw new Error("the test JPEG has no SOF0");
    if (marker === 0xc0) return { frame: offset, frameEnd: offset + 2 + length };
    offset += 2 + length;
  }
}

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

/** The JPEGs the sniffer refuses, each with a marker libjpeg rejects before its image data. */
export function refusedJpegs(jpeg: Uint8Array): RefusedJpeg[] {
  const { frame, frameEnd } = layout(jpeg);
  const before = (insert: readonly number[]) => inserted(jpeg, frame, insert);
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
    refused("SOF3 (lossless)", frameType(jpeg, 0xc3), "frame type 0xC3", false),
    refused("SOF5 (differential)", frameType(jpeg, 0xc5), "frame type 0xC5"),
    refused("JPG (0xC8)", frameType(jpeg, 0xc8), "frame type 0xC8"),
    refused("SOF9 (arithmetic)", frameType(jpeg, 0xc9), "frame type 0xC9", false),
    refused("SOF10 (arithmetic progressive)", frameType(jpeg, 0xca), "frame type 0xCA", false),
    refused("SOF11 (arithmetic lossless)", frameType(jpeg, 0xcb), "frame type 0xCB", false),
    refused("SOF13 (arithmetic differential)", frameType(jpeg, 0xcd), "frame type 0xCD"),
    refused("12-bit samples", patched(jpeg, frame + 4, 12), "precision of 12 bits", false),
    refused("16-bit samples", patched(jpeg, frame + 4, 16), "precision of 16 bits"),
    refused("a frame header one byte too long", lengthPlusOne, "frame header length is invalid"),
    refused("a frame header without components", noComponents, "frame header length is invalid"),
  ];
}

/** The JPEGs the sniffer accepts at 32x16: markers libjpeg reads on. */
export function acceptedJpegs(jpeg: Uint8Array): JpegVariant[] {
  const { frame, frameEnd } = layout(jpeg);
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
  ];
}
