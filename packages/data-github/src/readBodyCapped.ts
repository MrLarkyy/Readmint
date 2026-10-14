import { GitHubDataError } from "./GitHubDataError.js";

/**
 * Reads a response body as UTF-8 text, refusing it once it exceeds `maxBytes`: first by the
 * declared `content-length`, then by counting the streamed bytes, so a lying or absent header
 * cannot make the loader buffer an unbounded body.
 */
export async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge(maxBytes);
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
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GitHubDataError("invalid-response", "The GitHub response is not valid UTF-8.");
  }
}

function tooLarge(maxBytes: number): GitHubDataError {
  return new GitHubDataError(
    "too-large",
    `The GitHub response is larger than ${String(maxBytes)} bytes.`,
  );
}
