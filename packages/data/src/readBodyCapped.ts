/** Why `readBodyCapped` refused a body; the caller turns it into its own error. */
export type ReadBodyFailure = "too-large" | "not-utf8";

/**
 * Reads a response body as UTF-8 text, refusing it once it exceeds `maxBytes`: first by the
 * declared `content-length`, then by counting the streamed bytes, so a lying or absent header
 * cannot make the loader buffer an unbounded body. `fail` builds the thrown error, so each source
 * keeps its own error type and wording.
 */
export async function readBodyCapped(
  response: Response,
  maxBytes: number,
  fail: (reason: ReadBodyFailure) => Error,
): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw fail("too-large");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw fail("too-large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw fail("not-utf8");
  }
}
