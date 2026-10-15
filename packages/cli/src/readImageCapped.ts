import { RemoteImageError } from "./RemoteImageError.js";

/**
 * Reads a response body, refusing it (`image-too-large`) once it exceeds `maxBytes`: first by the declared
 * `content-length`, then by counting the streamed bytes, so a lying or absent header cannot make the CLI buffer an
 * unbounded body.
 */
export async function readImageCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge(maxBytes);
  }
  if (response.body === null) return new Uint8Array(0);
  // Node types the body of a Response loosely; its chunks are bytes.
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function tooLarge(maxBytes: number): RemoteImageError {
  return new RemoteImageError(
    "image-too-large",
    `the image is larger than ${String(maxBytes)} bytes`,
  );
}
