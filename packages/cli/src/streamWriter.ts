import type { Writable } from "node:stream";

/**
 * A `CliIo` writer for a process stream: resolves once the text is written, rejects with the error
 * the stream failed with. That is the system error (EPIPE, EBADF) whether it came through the write
 * callback or destroyed the stream first, not Node's "stream destroyed" for every later write.
 */
export function streamWriter(stream: Writable): (text: string) => Promise<void> {
  // The failure is reported through the callback; without a listener the error event would crash.
  stream.on("error", () => undefined);
  return (text) =>
    new Promise<void>((resolve, reject) => {
      stream.write(text, (error) => {
        if (error === undefined || error === null) resolve();
        else reject(stream.errored ?? error);
      });
    });
}
