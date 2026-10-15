/** Sum of the big-endian 32-bit words of `data`, zero-padded to a multiple of four, modulo 2^32. */
export function tableChecksum(data: Uint8Array): number {
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const word =
      (((data[index] ?? 0) << 24) |
        ((data[index + 1] ?? 0) << 16) |
        ((data[index + 2] ?? 0) << 8) |
        (data[index + 3] ?? 0)) >>>
      0;
    sum = (sum + word) >>> 0;
  }
  return sum;
}
