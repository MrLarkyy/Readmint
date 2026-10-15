import { decodeVarints } from "./decodeVarints.js";

/** A code point property kept as runs of equal values (a run table of ucdTables.ts), decoded on first use. */
export class RangeTable {
  private starts: Uint32Array | undefined;
  private values: Uint8Array | undefined;

  constructor(private readonly runs: string) {}

  /** The value index of `codePoint`; past the code space the value of the last run. */
  get(codePoint: number): number {
    if (this.starts === undefined || this.values === undefined) this.decode();
    const starts = this.starts ?? new Uint32Array(1);
    const values = this.values ?? new Uint8Array(1);
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >>> 1;
      if ((starts[middle] ?? 0) <= codePoint) low = middle;
      else high = middle - 1;
    }
    return values[low] ?? 0;
  }

  private decode(): void {
    const numbers = decodeVarints(this.runs);
    const count = numbers.length >>> 1;
    const starts = new Uint32Array(count);
    const values = new Uint8Array(count);
    let start = 0;
    for (let index = 0; index < count; index++) {
      start += numbers[index * 2] ?? 0;
      starts[index] = start;
      values[index] = numbers[index * 2 + 1] ?? 0;
    }
    this.starts = starts;
    this.values = values;
  }
}
