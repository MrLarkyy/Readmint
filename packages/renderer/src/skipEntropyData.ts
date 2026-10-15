/**
 * The first marker in the entropy-coded data from `start` and the offset just past its code, or undefined when the data
 * ends first. One pass as libjpeg reads it: `FF 00` is a stuffed zero, 0xFF fill bytes may precede a marker, and with
 * `restarts` the RST0-7 markers inside the data are passed over too.
 */
export function skipEntropyData(
  data: Uint8Array,
  start: number,
  restarts: boolean,
): { readonly marker: number; readonly offset: number } | undefined {
  let offset = start;
  for (;;) {
    const fill = data.indexOf(0xff, offset);
    if (fill < 0) return undefined;
    offset = fill + 1;
    while (data[offset] === 0xff) offset++;
    const marker = data[offset];
    if (marker === undefined) return undefined;
    offset++;
    const isRestart = marker >= 0xd0 && marker <= 0xd7;
    if (marker !== 0 && !(restarts && isRestart)) return { marker, offset };
  }
}
