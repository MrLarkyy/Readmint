import { RasterError } from "./RasterError.js";

/** Counts the bytes an encoder has produced and stops it the moment they pass the limit. */
export class OutputBudget {
  private used = 0;

  constructor(
    private readonly limit: number,
    private readonly label: string,
  ) {}

  get bytes(): number {
    return this.used;
  }

  add(bytes: number): void {
    this.set(this.used + bytes);
  }

  /** `bytes` written so far in total. */
  set(bytes: number): void {
    this.used = bytes;
    if (bytes <= this.limit) return;
    throw new RasterError(
      "raster-output-too-large",
      `the ${this.label} output reached ${String(bytes)} bytes, more than the ${String(this.limit)} allowed; lower the scale or the frame rate, or export SVG`,
    );
  }
}
