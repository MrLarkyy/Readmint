import { dataUriBytes } from "./exifImages.js";
import sof1Rgb12 from "./assets/jpeg/sof1-12bit-rgb.jpg?inline";
import sof1Grey12 from "./assets/jpeg/sof1-12bit-grey.jpg?inline";
import sof3Grey8 from "./assets/jpeg/sof3-8bit-grey.jpg?inline";
import sof3Ycbcr8 from "./assets/jpeg/sof3-8bit-ycbcr.jpg?inline";
import sof3Grey12 from "./assets/jpeg/sof3-12bit-grey.jpg?inline";
import sof3Rgb12 from "./assets/jpeg/sof3-12bit-rgb.jpg?inline";
import sof3Grey16 from "./assets/jpeg/sof3-16bit-grey.jpg?inline";
import sof9 from "./assets/jpeg/sof9.jpg?inline";
import sof10 from "./assets/jpeg/sof10.jpg?inline";
import sof11 from "./assets/jpeg/sof11.jpg?inline";

/** What resvg-wasm 2.6.2 makes of a frame type it refuses: nothing, a wasm trap, or a pixel it draws. */
export type ResvgOutcome = "nothing" | "traps" | readonly [number, number, number];

/**
 * Genuine JPEGs of the frame types and precisions the sniffer refuses, 32x16 gradients of the author's making. Each was
 * measured (RM-51) in Chromium 156.0.8078.4 and resvg-wasm 2.6.2 (jpeg-decoder 0.3.1); the refusal rests on that
 * result, so an upgrade that changes a row fails a test and asks for a new probe.
 *
 * Provenance. Encoders: libjpeg-turbo 3.1.3 (12-bit DCT, lossless 8/12/16-bit, R G B component ids and an Adobe APP14
 * marker on the RGB files); ffmpeg 9 `ljpeg` (3-component yuvj444p, ids 1 2 3, so the stored samples are YCbCr);
 * arithmetic files from a port of libjpeg's jcarith.c encode_mcu (SOF9 sequential, SOF10 progressive: a DC scan and
 * an AC 1-63 scan) and a lossless arithmetic coder after ITU-T T.81 H.1.2.3 (SOF11, predictor 1), the conditioning
 * table read from the libjpeg-turbo binary. The 8-bit RGB lossless files the sniffer accepts since RM-54, and their
 * refused variants, are in losslessJpegs.ts. Check: the libjpeg-turbo and ffmpeg files decode identically in
 * libjpeg-turbo 3.1.3 and in the Richter libjpeg (pylibjpeg-libjpeg 2.4.0); SOF9 and SOF10 decode within 2 of the
 * source in both; SOF11 round-trips exactly in the Richter libjpeg. mozjpeg (@jsquash/jpeg) has no arithmetic coder.
 */
export interface JpegFrameFixture {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** A part of the sniffer's message: the type or precision and the reason for the refusal. */
  readonly message: string;
  /** Chromium's pixel at (5,0) where the row pins it: the file draws at 32x16 either way. */
  readonly chromiumPixel?: readonly [number, number, number];
  readonly resvg: ResvgOutcome;
}

const precision12 = "precision of 12 bits is refused, because resvg draws it empty";
const lossless = (reason: string) => `frame type 0xC3 (lossless) is refused: ${reason};`;
const arithmetic = (marker: string) =>
  `frame type ${marker} (arithmetic coded) is refused, because resvg draws it empty`;

const row = (
  file: string,
  uri: string,
  message: string,
  resvg: ResvgOutcome,
  chromiumPixel?: readonly [number, number, number],
): JpegFrameFixture => ({
  name: file,
  bytes: dataUriBytes(uri),
  message,
  resvg,
  ...(chromiumPixel === undefined ? {} : { chromiumPixel }),
});

export const jpegFrameFixtures: readonly JpegFrameFixture[] = [
  row("sof1-12bit-rgb", sof1Rgb12, precision12, "nothing"),
  row("sof1-12bit-grey", sof1Grey12, precision12, "nothing"),
  row("sof3-8bit-grey", sof3Grey8, lossless("1 component"), [30, 30, 30], [0, 0, 0]),
  row(
    "sof3-8bit-ycbcr",
    sof3Ycbcr8,
    lossless("component ids 1 2 3"),
    [245, 128, 109],
    [36, 228, 130],
  ),
  row("sof3-12bit-grey", sof3Grey12, lossless("precision of 12 bits"), "nothing"),
  row("sof3-12bit-rgb", sof3Rgb12, lossless("precision of 12 bits"), "traps"),
  row("sof3-16bit-grey", sof3Grey16, lossless("precision of 16 bits"), "nothing"),
  row("sof9", sof9, arithmetic("0xC9"), "nothing"),
  row("sof10", sof10, arithmetic("0xCA"), "nothing"),
  row("sof11", sof11, arithmetic("0xCB"), "nothing"),
];
