import { dataUriBytes } from "./exifImages.js";
import cmykUri from "./assets/jpeg/cmyk.jpg?inline";
import progressiveUri from "./assets/jpeg/progressive.jpg?inline";

/**
 * What one output draws of a 32x16 case: nothing (no opaque pixel), or every pixel opaque, pinned by one (0,0 unless named).
 * "partial" never is a pin; a test that measures it fails.
 */
export type DrawnOutcome = "nothing" | "partial" | readonly [number, number, number];

export interface JpegStructureCase {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** A part of the sniffer's message; undefined where the sniffer accepts the file. */
  readonly message?: string;
  /** Measured in Chromium 156.0.8078.4 and resvg-wasm 2.6.2 (RM-54 audit probe); absent where only the source decides. */
  readonly chromium?: DrawnOutcome;
  readonly resvg?: DrawnOutcome;
}

/** Classifies RGBA pixels of a 32x16 drawing, pinned by the pixel `at`. */
export function drawnOutcome(
  rgba: Uint8Array | Uint8ClampedArray,
  at: readonly [x: number, y: number] = [0, 0],
): DrawnOutcome {
  let opaque = 0;
  for (let index = 3; index < rgba.length; index += 4) if (rgba[index] === 255) opaque++;
  if (opaque === 0) return "nothing";
  if (opaque !== 32 * 16) return "partial";
  const offset = 4 * (at[1] * 32 + at[0]);
  return [rgba[offset] ?? -1, rgba[offset + 1] ?? -1, rgba[offset + 2] ?? -1];
}

const segment = (marker: number, body: readonly number[]) => [
  0xff,
  marker,
  (body.length + 2) >> 8,
  (body.length + 2) & 0xff,
  ...body,
];
const adobe = (transform: number, sixth = 0) =>
  segment(0xee, [0x41, 0x64, 0x6f, 0x62, 0x65, sixth, 100, 0, 0, 0, 0, transform]);
const oneCode = (id: number) => [id, 1, ...new Array<number>(15).fill(0), 0];

interface FlatComponent {
  readonly id: number;
  readonly h: number;
  readonly v: number;
}

/**
 * A baseline 32x16 JPEG built here: one 8-bit DQT of ones, one-code Huffman tables (DC category 0 and AC EOB are `0`),
 * every block DC 0 and EOB, so flat grey 128 where it draws; `scans` lists each scan's component ids.
 */
function flatJpeg(
  components: readonly FlatComponent[],
  scans: readonly (readonly number[])[],
  dcTable: readonly number[] = oneCode(0x00),
): Uint8Array {
  const hMax = Math.max(...components.map(({ h }) => h));
  const vMax = Math.max(...components.map(({ v }) => v));
  const data = (scanned: readonly FlatComponent[]) => {
    const blocks =
      scanned.length > 1
        ? Math.ceil(32 / (8 * hMax)) *
          Math.ceil(16 / (8 * vMax)) *
          scanned.reduce((sum, { h, v }) => sum + h * v, 0)
        : scanned.reduce(
            (sum, { h, v }) =>
              sum +
              Math.ceil(Math.ceil((32 * h) / hMax) / 8) * Math.ceil(Math.ceil((16 * v) / vMax) / 8),
            0,
          );
    const bits = "00".repeat(blocks) + "1".repeat((8 - ((2 * blocks) % 8)) % 8);
    return Array.from({ length: bits.length / 8 }, (_, index) =>
      Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
    );
  };
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
    ...segment(0xc0, [
      8,
      0,
      16,
      0,
      32,
      components.length,
      ...components.flatMap(({ id, h, v }) => [id, (h << 4) | v, 0]),
    ]),
    ...segment(0xc4, [...dcTable, ...oneCode(0x10)]),
    ...scans.flatMap((ids) => {
      const scanned = ids.flatMap((id) => components.filter((component) => component.id === id));
      return [
        ...segment(0xda, [ids.length, ...ids.flatMap((id) => [id, 0]), 0, 63, 0]),
        ...data(scanned),
      ];
    }),
    0xff,
    0xd9,
  ]);
}

/**
 * A Motion JPEG frame as cameras write it: an AVI1 APP0, no DHT (the decoder brings the default tables of T.81 Annex
 * K), 32x16 YCbCr at 1x1, luma on tables 0 and chroma on tables 1, every block DC 0 and EOB (luma DC `00`, AC
 * `1010`; chroma DC `00`, AC `00`), so flat grey 128.
 */
function motionJpegFrame(): Uint8Array {
  const mcu = "00101000000000";
  const bits = mcu.repeat(8);
  const data = Array.from({ length: bits.length / 8 }, (_, index) =>
    Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
  );
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [0x41, 0x56, 0x49, 0x31, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
    ...segment(0xc0, [8, 0, 16, 0, 32, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]),
    ...segment(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]),
    ...data,
    0xff,
    0xd9,
  ]);
}

/** A DC table whose codes `0` (category 0) and `1` (category 1) fill length 1, so the second is all ones. */
const allOnesDcTable = [0x00, 2, ...new Array<number>(15).fill(0), 0, 1];

const at1x1 = (...ids: number[]) => ids.map((id) => ({ id, h: 1, v: 1 }));

interface Segment {
  readonly at: number;
  readonly marker: number;
  readonly end: number;
}

function segmentsOf(jpeg: Uint8Array): Segment[] {
  const list: Segment[] = [];
  for (let at = 2; ;) {
    const marker = jpeg[at + 1] ?? 0;
    const end = at + 2 + (((jpeg[at + 2] ?? 0) << 8) | (jpeg[at + 3] ?? 0));
    list.push({ at, marker, end });
    if (marker === 0xda) return list;
    if (end <= at || end > jpeg.length) throw new Error("the test JPEG has no SOS");
    at = end;
  }
}

const inserted = (jpeg: Uint8Array, at: number, insert: readonly number[]) =>
  new Uint8Array([...jpeg.subarray(0, at), ...insert, ...jpeg.subarray(at)]);
const removed = (jpeg: Uint8Array, from: Segment) =>
  new Uint8Array([...jpeg.subarray(0, from.at), ...jpeg.subarray(from.end)]);
const patched = (jpeg: Uint8Array, edits: readonly (readonly [number, number])[]) => {
  const bytes = jpeg.slice();
  for (const [at, value] of edits) bytes[at] = value;
  return bytes;
};

/**
 * The cases of the RM-54 audit of jpeg-decoder 0.3.1 against libjpeg-turbo 3.1: segment, frame, scan and post-scan
 * conditions, each built from `gradient` (the test JPEG: baseline, JFIF, ids 1 2 3 sampled 2x2 1x1 1x1, DQT 0 and 1,
 * four DHT, one interleaved scan, EOI), from the hand-built flat files, or genuine: cmyk.jpg (libjpeg-turbo 3.1.3
 * through imagecodecs 2026.3.6, `jpeg8_encode(cmyk, level=90, colorspace="CMYK", outcolorspace="CMYK")`, Adobe
 * transform 0) and progressive.jpg (mozjpeg 4.1.5 through imagecodecs, `mozjpeg_encode(rgb, level=90,
 * progressive=True)`: a DC scan of all three components, then an AC 1-63 scan of each), both of the RM-51 gradient.
 * Pixels pinned at (0,0): the gradient drawn as YCbCr is 65,71,167, read as RGB 80,177,117.
 */
export function jpegStructureCases(gradient: Uint8Array): JpegStructureCase[] {
  const segments = segmentsOf(gradient);
  const first = (marker: number) => {
    const found = segments.find((candidate) => candidate.marker === marker);
    if (found === undefined) throw new Error(`the test JPEG has no ${marker.toString(16)}`);
    return found;
  };
  const app0 = first(0xe0);
  const dqt = first(0xdb);
  const frame = first(0xc0);
  const scan = first(0xda);
  const eoi = gradient.length - 2;
  const parameters = scan.at + 5 + 2 * (gradient[scan.at + 4] ?? 0);
  const ids = (a: number, b: number, c: number, jpeg = gradient) =>
    patched(jpeg, [
      [frame.at + 10, a],
      [frame.at + 13, b],
      [frame.at + 16, c],
      [scan.at + 5, a],
      [scan.at + 7, b],
      [scan.at + 9, c],
    ]);
  // Without the JFIF APP0 every later offset moves back by its length.
  const shift = app0.end - app0.at;
  const noJfif = (jpeg: Uint8Array) => removed(jpeg, app0);
  const ids456NoJfif = noJfif(ids(4, 5, 6));
  const progressive = dataUriBytes(progressiveUri);
  const progressiveScans: number[] = [];
  for (let at = 2; at < progressive.length - 1; at++) {
    if (progressive[at] === 0xff && progressive[at + 1] === 0xda) progressiveScans.push(at);
  }
  const ycbcr = [65, 71, 167] as const;
  const asRgb = [80, 177, 117] as const;
  const grey = [128, 128, 128] as const;
  const scaled = [0, 3, 245] as const;
  const both = (pixel: DrawnOutcome) => ({ chromium: pixel, resvg: pixel });
  const resvgNothing = (pixel: DrawnOutcome) => ({ chromium: pixel, resvg: "nothing" as const });
  const tem = [0xff, 0x01];
  return [
    // Segments jpeg-decoder rejects wherever they are, libjpeg reads.
    {
      name: "Adobe transform 3 before the frame header",
      bytes: inserted(gradient, frame.at, adobe(3)),
      message: "Adobe transform 3",
      ...resvgNothing(ycbcr),
    },
    {
      name: "Adobe transform 3 before EOI",
      bytes: inserted(gradient, eoi, adobe(3)),
      message: "Adobe transform 3",
      ...resvgNothing(ycbcr),
    },
    {
      name: "a quantization table with a zero entry",
      bytes: patched(gradient, [[dqt.at + 15, 0]]),
      message: "with a zero entry",
      ...resvgNothing(ycbcr),
    },
    {
      name: "an unused quantization table of precision 2",
      bytes: inserted(gradient, frame.at, segment(0xdb, [0x23, ...new Array<number>(128).fill(1)])),
      message: "quantization table of precision 2",
      ...resvgNothing(ycbcr),
    },
    {
      name: "an unused Huffman table without codes",
      bytes: inserted(gradient, frame.at, segment(0xc4, [0x13, ...new Array<number>(16).fill(0)])),
      message: "without codes",
      ...resvgNothing(ycbcr),
    },
    {
      name: "an unused Huffman table of invalid code lengths",
      bytes: inserted(
        gradient,
        frame.at,
        segment(0xc4, [0x13, 3, ...new Array<number>(15).fill(0), 1, 2, 3]),
      ),
      message: "invalid code lengths",
      ...resvgNothing(ycbcr),
    },
    {
      name: "no DHT",
      bytes: segments
        .filter(({ marker }) => marker === 0xc4)
        .reverse()
        .reduce(removed, gradient),
      message: "which no DHT defines",
      chromium: [176, 178, 173],
      resvg: "nothing",
    },
    {
      name: "a quantization table id 4",
      bytes: inserted(gradient, frame.at, segment(0xdb, [0x04, ...new Array<number>(64).fill(1)])),
      message: "quantization table 4",
    },
    {
      name: "a quantization table segment one byte short",
      bytes: inserted(gradient, frame.at, segment(0xdb, [0x03, ...new Array<number>(63).fill(1)])),
      message: "quantization table segment of an invalid length",
    },
    {
      name: "a Huffman table segment without its values",
      bytes: inserted(
        gradient,
        frame.at,
        segment(0xc4, [0x13, 1, ...new Array<number>(15).fill(0)]),
      ),
      message: "Huffman table segment of an invalid length",
    },
    {
      name: "a scan header of an invalid length",
      bytes: patched(gradient, [[scan.at + 3, (gradient[scan.at + 3] ?? 0) + 1]]),
      message: "scan header of an invalid length",
    },
    {
      name: "sampling 0x1",
      bytes: flatJpeg([{ id: 1, h: 0, v: 1 }, ...at1x1(2, 3)], [[1, 2, 3]]),
      message: "component 1 is sampled 0x1",
    },
    {
      name: "a Huffman table of class 2",
      bytes: inserted(gradient, frame.at, segment(0xc4, oneCode(0x23))),
      message: "Huffman table id 0x23",
    },
    {
      name: "a restart interval segment of 6 bytes",
      bytes: inserted(gradient, frame.at, segment(0xdd, [0, 0, 0, 0])),
      message: "restart interval segment of an invalid length",
      ...both("nothing"),
    },
    // Markers after the image data: jpeg-decoder takes only tables, APPn, COM, a restart right after the data, SOS and EOI.
    {
      name: "TEM before EOI",
      bytes: inserted(gradient, eoi, tem),
      message: "marker 0x01 after the image data",
      ...resvgNothing(ycbcr),
    },
    {
      name: "SOI before EOI",
      bytes: inserted(gradient, eoi, [0xff, 0xd8]),
      message: "marker 0xD8 after the image data",
      ...resvgNothing(ycbcr),
    },
    {
      name: "DNL before EOI",
      bytes: inserted(gradient, eoi, segment(0xdc, [0, 16])),
      message: "marker 0xDC after the image data",
      ...resvgNothing(ycbcr),
    },
    {
      name: "EXP before EOI",
      bytes: inserted(gradient, eoi, segment(0xdf, [0x11])),
      message: "marker 0xDF after the image data",
      ...resvgNothing(ycbcr),
    },
    {
      name: "a COM, then RST0 before EOI",
      bytes: inserted(gradient, eoi, [...segment(0xfe, [0x68, 0x69]), 0xff, 0xd0]),
      message: "marker 0xD0 after the image data",
      ...resvgNothing(ycbcr),
    },
    {
      name: "SOF1 with TEM before EOI",
      bytes: inserted(patched(gradient, [[frame.at + 1, 0xc1]]), eoi, tem),
      message: "marker 0x01 after the image data",
      ...resvgNothing(ycbcr),
    },
    {
      name: "progressive with TEM before EOI",
      bytes: inserted(progressive, progressive.length - 2, tem),
      message: "marker 0x01 after the image data",
      ...resvgNothing(scaled),
    },
    {
      name: "fill bytes before a stuffed zero in the image data",
      bytes: inserted(gradient, scan.end, [0xff, 0xff, 0]),
      message: "fill bytes before a stuffed zero",
    },
    // Frames.
    {
      name: "4 components (CMYK)",
      bytes: dataUriBytes(cmykUri),
      message: "frame of 4 components",
      ...resvgNothing([0, 0, 40]),
    },
    {
      name: "2 components",
      bytes: flatJpeg(at1x1(1, 2), [[1, 2]]),
      message: "frame of 2 components",
      ...both("nothing"),
    },
    {
      name: "component ids 1 1 3",
      bytes: ids(1, 1, 3),
      message: "component ids 1 1 3",
      ...resvgNothing(ycbcr),
    },
    {
      name: "sampling 3x1, 2x1, 1x1",
      bytes: flatJpeg(
        [
          { id: 1, h: 3, v: 1 },
          { id: 2, h: 2, v: 1 },
          { id: 3, h: 1, v: 1 },
        ],
        [[1, 2, 3]],
      ),
      message: "component 2 is sampled 2x1",
      ...both("nothing"),
    },
    {
      name: "a component on an undefined quantization table",
      bytes: patched(gradient, [[frame.at + 18, 2]]),
      message: "which no DQT defines",
    },
    // Scan headers.
    {
      name: "a sequential scan from coefficient 1",
      bytes: patched(gradient, [[parameters, 1]]),
      message: "sequential scan with spectral selection 1-63",
      ...resvgNothing(ycbcr),
    },
    {
      name: "a sequential scan up to coefficient 62",
      bytes: patched(gradient, [[parameters + 1, 62]]),
      message: "sequential scan with spectral selection 0-62",
      ...resvgNothing(ycbcr),
    },
    {
      name: "a sequential scan with point transform 1",
      bytes: patched(gradient, [[parameters + 2, 1]]),
      message: "successive approximation 0/1",
      ...resvgNothing(ycbcr),
    },
    {
      name: "scan components out of frame order",
      bytes: patched(gradient, [
        [scan.at + 5, gradient[scan.at + 9] ?? 0],
        [scan.at + 6, gradient[scan.at + 10] ?? 0],
        [scan.at + 9, gradient[scan.at + 5] ?? 0],
        [scan.at + 10, gradient[scan.at + 6] ?? 0],
      ]),
      message: "out of frame order",
      ...both("nothing"),
    },
    {
      name: "a scan of a component the frame lacks",
      bytes: patched(gradient, [[scan.at + 9, 4]]),
      message: "which the frame lacks",
    },
    {
      name: "a scan of more than 10 blocks per MCU",
      bytes: flatJpeg([{ id: 1, h: 4, v: 3 }, ...at1x1(2, 3)], [[1, 2, 3]]),
      message: "more than 10 blocks per MCU",
    },
    {
      name: "a progressive scan with successive approximation 14/13",
      bytes: patched(progressive, [[(progressiveScans[1] ?? 0) + 9, 0xed]]),
      message: "successive approximation 14/13",
    },
    // Scan coverage.
    {
      name: "a component never scanned",
      bytes: flatJpeg(at1x1(1, 2, 3), [[1], [2]]),
      message: "component 3 is never completely scanned",
      ...resvgNothing(grey),
    },
    {
      name: "a component scanned twice",
      bytes: flatJpeg(at1x1(1, 2, 3), [[1], [2], [3], [1]]),
      message: "scan of component 1 after it is complete",
      ...both(grey),
    },
    {
      name: "an interleaved scan, then one of component 1",
      bytes: flatJpeg(at1x1(1, 2, 3), [[1, 2, 3], [1]]),
      message: "scan of component 1 after it is complete",
      ...both(grey),
    },
    {
      name: "progressive cut after its DC scan",
      bytes: new Uint8Array([...progressive.subarray(0, progressiveScans[1]), 0xff, 0xd9]),
      message: "component 1 is never completely scanned",
      chromium: [0, 66, 161],
      resvg: [17, 76, 152],
    },
    {
      name: "a quantization table redefined between two scans of a component",
      bytes: inserted(
        progressive,
        progressiveScans[1] ?? 0,
        segment(0xdb, [0, ...new Array<number>(64).fill(2)]),
      ),
      message: "quantization table 0 redefined between two scans of a component",
    },
    // Colour spaces: libjpeg reads JFIF, then Adobe, then the ids, up to the first scan; jpeg-decoder the ids first, up to EOI.
    {
      name: "component ids R G B with JFIF",
      bytes: ids(82, 71, 66),
      message: "Chromium reads as YCbCr and resvg as RGB",
      chromium: ycbcr,
      resvg: asRgb,
    },
    {
      name: "no JFIF, Adobe transform 0",
      bytes: inserted(noJfif(gradient), frame.at - shift, adobe(0)),
      message: "Chromium reads as RGB and resvg as YCbCr",
      chromium: asRgb,
      resvg: ycbcr,
    },
    {
      name: "no JFIF, ids 4 5 6, Adobe transform 0 before EOI",
      bytes: inserted(ids456NoJfif, eoi - shift, adobe(0)),
      message: "Chromium reads as YCbCr and resvg as RGB",
      chromium: ycbcr,
      resvg: asRgb,
    },
    {
      name: "no JFIF, ids 4 5 6, Adobe transform 0, JFIF before EOI",
      bytes: inserted(inserted(ids456NoJfif, frame.at - shift, adobe(0)), eoi - shift + 16, [
        ...gradient.subarray(app0.at, app0.end),
      ]),
      message: "Chromium reads as RGB and resvg as YCbCr",
      chromium: asRgb,
      resvg: ycbcr,
    },
    {
      name: "no JFIF, ids 4 5 6, Adobe transform 0 with sixth byte 1",
      bytes: inserted(ids456NoJfif, frame.at - shift, adobe(0, 1)),
      message: "Chromium reads as RGB and resvg as YCbCr",
      chromium: asRgb,
      resvg: ycbcr,
    },
    {
      name: "component ids 1 34 35",
      bytes: ids(1, 34, 35),
      message: "resvg not at all",
      ...resvgNothing(ycbcr),
    },
    {
      name: "component ids r g b",
      bytes: ids(114, 103, 98),
      message: "resvg not at all",
      ...resvgNothing(ycbcr),
    },
    {
      name: "no JFIF, ids 4 5 6, Adobe transform 2",
      bytes: inserted(ids456NoJfif, frame.at - shift, adobe(2)),
      message: "resvg not at all",
      ...resvgNothing(ycbcr),
    },
    // Accepted controls, both outputs alike.
    {
      name: "a DQT before EOI",
      bytes: inserted(gradient, eoi, [...gradient.subarray(dqt.at, dqt.end)]),
      ...both(ycbcr),
    },
    {
      name: "a DRI before EOI",
      bytes: inserted(gradient, eoi, segment(0xdd, [0, 0])),
      ...both(ycbcr),
    },
    {
      name: "RST0 right after the image data",
      bytes: inserted(gradient, eoi, [0xff, 0xd0]),
      ...both(ycbcr),
    },
    {
      name: "Adobe transform 1 before EOI",
      bytes: inserted(gradient, eoi, adobe(1)),
      ...both(ycbcr),
    },
    {
      name: "a sequential scan ending at coefficient 0",
      bytes: patched(gradient, [[parameters + 1, 0]]),
      ...both(ycbcr),
    },
    { name: "component ids 4 5 6 with JFIF", bytes: ids(4, 5, 6), ...both(ycbcr) },
    { name: "no JFIF", bytes: noJfif(gradient), ...both(ycbcr) },
    { name: "no JFIF, ids 4 5 6", bytes: ids456NoJfif, ...both(ycbcr) },
    {
      name: "no JFIF, ids 4 5 6, Adobe transform 1",
      bytes: inserted(ids456NoJfif, frame.at - shift, adobe(1)),
      ...both(ycbcr),
    },
    {
      name: "three non-interleaved scans",
      bytes: flatJpeg(at1x1(1, 2, 3), [[1], [2], [3]]),
      ...both(grey),
    },
    {
      name: "sampling 3x1, 1x1, 1x1",
      bytes: flatJpeg([{ id: 1, h: 3, v: 1 }, ...at1x1(2, 3)], [[1, 2, 3]]),
      ...both(grey),
    },
    {
      name: "sampling 4x1, 1x1, 1x1",
      bytes: flatJpeg([{ id: 1, h: 4, v: 1 }, ...at1x1(2, 3)], [[1, 2, 3]]),
      ...both(grey),
    },
    {
      name: "sampling 1x1, 2x1, 1x1",
      bytes: flatJpeg(
        [
          { id: 1, h: 1, v: 1 },
          { id: 2, h: 2, v: 1 },
          { id: 3, h: 1, v: 1 },
        ],
        [[1, 2, 3]],
      ),
      ...both(grey),
    },
    { name: "grey", bytes: flatJpeg(at1x1(1), [[1]]), ...both(grey) },
    { name: "grey sampled 2x2", bytes: flatJpeg([{ id: 1, h: 2, v: 2 }], [[1]]), ...both(grey) },
    { name: "progressive", bytes: progressive, ...both(scaled) },
    { name: "a Motion JPEG frame (AVI1, no DHT)", bytes: motionJpegFrame(), ...both(grey) },
    {
      name: "an unused Huffman table with a code of all ones",
      bytes: inserted(gradient, frame.at, segment(0xc4, [0x13, ...allOnesDcTable.slice(1)])),
      ...both(ycbcr),
    },
    { name: "a baseline file without EOI", bytes: gradient.slice(0, eoi), ...both("nothing") },
    {
      name: "a baseline file cut inside its image data",
      bytes: gradient.slice(0, scan.end + Math.floor((eoi - scan.end) / 2)),
      ...both("nothing"),
    },
    {
      name: "a scan on a Huffman table with a code of all ones",
      bytes: flatJpeg(at1x1(1, 2, 3), [[1, 2, 3]], allOnesDcTable),
      message: "which has a code of all ones",
      chromium: "nothing",
      resvg: grey,
    },
    {
      name: "a progressive file without EOI",
      bytes: progressive.slice(0, progressive.length - 2),
      message: "progressive file that ends before its end-of-image marker",
      chromium: scaled,
      resvg: "nothing",
    },
    {
      name: "a progressive file cut before its last scan",
      bytes: progressive.slice(0, progressiveScans[3]),
      message: "progressive file that ends before its end-of-image marker",
      chromium: [0, 21, 245],
      resvg: "nothing",
    },
  ];
}
