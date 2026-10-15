import { dataUriBytes } from "./exifImages.js";
import p1 from "./assets/jpeg/sof3-8bit-rgb.jpg?inline";
import p2 from "./assets/jpeg/sof3-8bit-rgb-p2.jpg?inline";
import p3 from "./assets/jpeg/sof3-8bit-rgb-p3.jpg?inline";
import p4 from "./assets/jpeg/sof3-8bit-rgb-p4.jpg?inline";
import p5 from "./assets/jpeg/sof3-8bit-rgb-p5.jpg?inline";
import p6 from "./assets/jpeg/sof3-8bit-rgb-p6.jpg?inline";
import p7 from "./assets/jpeg/sof3-8bit-rgb-p7.jpg?inline";
import noAdobe from "./assets/jpeg/sof3-8bit-rgb-noadobe.jpg?inline";
import jfif from "./assets/jpeg/sof3-8bit-rgb-jfif.jpg?inline";
import adobe1 from "./assets/jpeg/sof3-8bit-rgb-adobe1.jpg?inline";
import adobe2 from "./assets/jpeg/sof3-8bit-rgb-adobe2.jpg?inline";
import twoAdobe from "./assets/jpeg/sof3-8bit-rgb-two-adobe.jpg?inline";
import adobe1AfterSof from "./assets/jpeg/sof3-8bit-rgb-adobe1-after-sof.jpg?inline";
import h1v2 from "./assets/jpeg/sof3-8bit-rgb-h1v2.jpg?inline";
import al1 from "./assets/jpeg/sof3-8bit-rgb-al1.jpg?inline";
import tq1 from "./assets/jpeg/sof3-8bit-rgb-tq1.jpg?inline";

/**
 * What an output draws of a lossless JPEG: the source gradient exactly, nothing (no opaque pixel), or other pixels,
 * pinned by the one at (5,0).
 */
export type LosslessOutcome = "equal" | "nothing" | readonly [number, number, number];

export interface LosslessJpegFixture {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface RefusedLosslessJpeg extends LosslessJpegFixture {
  /** The reason in the sniffer's message, after "frame type 0xC3 (lossless) is refused: ". */
  readonly reason: string;
  /** Measured in Chromium 156.0.8078.4, where probed. */
  readonly chromium?: LosslessOutcome;
  /** Measured in resvg-wasm 2.6.2 (jpeg-decoder 0.3.1), where probed. */
  readonly resvg?: LosslessOutcome;
}

/** The source of every file here: 32x16, R = 8x, G = 16y, B = 255 - 8x, RGB bytes row by row. */
export function expectedGradient(): Uint8Array {
  const pixels = new Uint8Array(32 * 16 * 3);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) pixels.set([x * 8, y * 16, 255 - x * 8], (y * 32 + x) * 3);
  }
  return pixels;
}

/** Classifies an output's RGBA pixels of a lossless file drawn at `width` x `height` against the source gradient. */
export function losslessOutcome(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): LosslessOutcome {
  const pixels = width * height;
  let opaque = 0;
  let equal = width === 32 && height === 16;
  const expected = expectedGradient();
  for (let pixel = 0; pixel < pixels; pixel++) {
    if (rgba[pixel * 4 + 3] === 255) opaque++;
    for (let channel = 0; channel < 3; channel++) {
      if (rgba[pixel * 4 + channel] !== expected[pixel * 3 + channel]) equal = false;
    }
  }
  if (opaque === 0) return "nothing";
  if (equal && opaque === pixels) return "equal";
  return [rgba[20] ?? -1, rgba[21] ?? -1, rgba[22] ?? -1];
}

/**
 * Genuine 8-bit RGB lossless JPEGs (RM-54), which Chromium 156.0.8078.4 and resvg-wasm 2.6.2 both draw equal to the
 * source gradient: libjpeg-turbo 3.1.3 through imagecodecs 2026.3.6, `jpeg8_encode(rgb, lossless=True,
 * bitspersample=8, predictor=N)` for N 1-7 (N 1 is the RM-51 file sof3-8bit-rgb.jpg); components R G B at 1x1, an
 * Adobe APP14 of transform 0, one interleaved scan, point transform 0. Each decodes back to the source in
 * libjpeg-turbo and in the Richter libjpeg (pylibjpeg-libjpeg 2.4.0). noadobe is p1 with its APP14 removed.
 */
export const acceptedLosslessJpegs: readonly LosslessJpegFixture[] = [
  ...[p1, p2, p3, p4, p5, p6, p7].map((uri, index) => ({
    name: `predictor ${String(index + 1)}`,
    bytes: dataUriBytes(uri),
  })),
  { name: "no Adobe segment", bytes: dataUriBytes(noAdobe) },
];

/** p1's segments: SOI, APP14 (16 bytes), SOF3 (19), DHT (26), SOS (14), the scan data, EOI. */
const source = dataUriBytes(p1);
const app14 = 2;
const frame = 18;
const afterFrame = 37;
const scan = 63;

function checkedLayout(): void {
  const markers = [source[app14 + 1], source[frame + 1], source[afterFrame + 1], source[scan + 1]];
  if (markers.join() !== [0xee, 0xc3, 0xc4, 0xda].join()) throw new Error("unexpected p1 layout");
}

const part = (start: number, end?: number) => [...source.subarray(start, end)];
const joined = (...parts: (readonly number[])[]) => new Uint8Array(parts.flat());
const patched = (edits: readonly (readonly [at: number, value: number])[]) => {
  const bytes = source.slice();
  for (const [at, value] of edits) bytes[at] = value;
  return bytes;
};
/** p1's Adobe segment with the transform byte (payload byte 11) set. */
const adobe = (transform: number) => {
  const segment = part(app14, frame);
  segment[15] = transform;
  return segment;
};
const ids = (r: number, g: number, b: number) =>
  [
    [frame + 10, r],
    [frame + 13, g],
    [frame + 16, b],
  ] as const;
const selectors = (r: number, g: number, b: number) =>
  [
    [scan + 5, r],
    [scan + 7, g],
    [scan + 9, b],
  ] as const;

const file = (
  name: string,
  uri: string,
  reason: string,
  chromium: LosslessOutcome,
  resvg: LosslessOutcome,
): RefusedLosslessJpeg => ({ name, bytes: dataUriBytes(uri), reason, chromium, resvg });

const built = (
  name: string,
  bytes: Uint8Array,
  reason: string,
  measured?: { readonly chromium: LosslessOutcome; readonly resvg: LosslessOutcome },
): RefusedLosslessJpeg => ({ name, bytes, reason, ...measured });

/**
 * Lossless JPEGs the sniffer refuses, each with the reason it names. The files are p1 with one segment edit (RM-54
 * scripts derive.mjs), each probed: Chromium and resvg draw them differently. The built rows are p1 patched here; the
 * three with a measured outcome were probed as the same bytes, drawn alike, and are refused as untested cases.
 */
export function refusedLosslessJpegs(): RefusedLosslessJpeg[] {
  checkedLayout();
  const head = part(0, app14);
  const rest = part(frame);
  const both = "equal";
  return [
    file("a JFIF APP0", jfif, "a JFIF segment", "nothing", both),
    file("Adobe transform 1", adobe1, "Adobe transform 1", "nothing", both),
    file("Adobe transform 2", adobe2, "Adobe transform 2", "nothing", both),
    file("Adobe transform 0, then 1", twoAdobe, "Adobe transform 1", "nothing", both),
    file(
      "Adobe transform 1 after the frame header",
      adobe1AfterSof,
      "Adobe transform 1",
      "nothing",
      both,
    ),
    file("sampling 1x2", h1v2, "sampling 1x2", [40, 215, 128], both),
    file("point transform 1", al1, "point transform 1", [208, 128, 46], [240, 0, 208]),
    file("quantization table 1", tq1, "quantization table 1", both, "nothing"),
    built(
      "an Adobe segment of 11 bytes",
      joined(head, [0xff, 0xee, 0, 13], part(app14 + 4, frame - 1), rest),
      "a short Adobe segment",
      { chromium: both, resvg: both },
    ),
    built(
      "component ids 1 2 3",
      patched([...ids(1, 2, 3), ...selectors(1, 2, 3)]),
      "component ids 1 2 3",
      {
        chromium: both,
        resvg: both,
      },
    ),
    built(
      "a DRI after the frame header",
      joined(part(0, afterFrame), [0xff, 0xdd, 0, 4, 0, 0], part(afterFrame)),
      "a restart interval",
      { chromium: both, resvg: both },
    ),
    built(
      "a DRI before the frame header",
      joined(part(0, frame), [0xff, 0xdd, 0, 4, 0, 0], rest),
      "a restart interval",
    ),
    built("Adobe transform 1, then 0", joined(head, adobe(1), adobe(0), rest), "Adobe transform 1"),
    built(
      "an Adobe segment whose sixth byte is 1, transform 1",
      joined(
        head,
        adobe(1).map((byte, index) => (index === 9 ? 1 : byte)),
        rest,
      ),
      "Adobe transform 1",
    ),
    built(
      "a JFIF APP0 of 4 bytes",
      joined(head, [0xff, 0xe0, 0, 6, 0x4a, 0x46, 0x49, 0x46], part(app14)),
      "a JFIF segment",
    ),
    built(
      "component ids B G R",
      patched([...ids(66, 71, 82), ...selectors(66, 71, 82)]),
      "component ids 66 71 82",
    ),
    built("scan components B G R", patched(selectors(66, 71, 82)), "scan components 66 71 82"),
    built(
      "a scan of 1 component",
      joined(part(0, scan), [0xff, 0xda, 0, 8, 1, 0x52, 0, 1, 0, 0], part(scan + 14)),
      "a scan of 1 component",
    ),
    built(
      "an invalid scan header length",
      patched([[scan + 3, 13]]),
      "an invalid scan header length",
    ),
    built("predictor 0", patched([[scan + 11, 0]]), "predictor 0"),
    built("predictor 8", patched([[scan + 11, 8]]), "predictor 8"),
    built(
      "a spectral selection end of 1",
      patched([[scan + 12, 1]]),
      "a spectral selection end of 1",
    ),
    built("successive approximation 1", patched([[scan + 13, 0x10]]), "successive approximation 1"),
    built("4 components", patched([[frame + 9, 4]]), "4 components"),
    built(
      "a frame header one byte too long",
      joined(part(0, frame + 3), [18], part(frame + 4, afterFrame), [0], part(afterFrame)),
      "an invalid frame header length",
    ),
    built("cut before the scan", source.slice(0, scan), "the file ends before its image data"),
    built(
      "cut inside the scan header",
      source.slice(0, scan + 8),
      "the file ends before its image data",
    ),
  ];
}

/** p1 with its frame header twice: the walk refuses it before the lossless rule applies. */
export function losslessWithSecondFrameHeader(): Uint8Array {
  checkedLayout();
  return joined(part(0, afterFrame), part(frame, afterFrame), part(afterFrame));
}
