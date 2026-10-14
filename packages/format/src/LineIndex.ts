/** Maps source offsets to 1-based line and column (UTF-16 units); lines end at `\n`. */
export class LineIndex {
  private starts: number[] | undefined;

  constructor(private readonly source: string) {}

  at(offset: number): { line: number; column: number } {
    const starts = (this.starts ??= this.collectStarts());
    const clamped = Math.max(0, Math.min(offset, this.source.length));
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((starts[middle] ?? 0) <= clamped) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: clamped - (starts[low] ?? 0) + 1 };
  }

  private collectStarts(): number[] {
    const starts = [0];
    for (
      let index = this.source.indexOf("\n");
      index !== -1;
      index = this.source.indexOf("\n", index + 1)
    )
      starts.push(index + 1);
    return starts;
  }
}
