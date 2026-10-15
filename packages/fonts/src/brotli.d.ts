// brotli@1.3.3 ships no types. Only its decoder is used: it throws when the output passes `outputSize`.
declare module "brotli/decompress.js" {
  function decompress(buffer: Uint8Array, outputSize?: number): Uint8Array;
  export = decompress;
}
