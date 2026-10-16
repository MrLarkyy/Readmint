import { describe, expect, test } from "vitest";
import { readBodyCapped, type ReadBodyFailure } from "../src/index.js";

class BodyError extends Error {
  constructor(readonly reason: ReadBodyFailure) {
    super(`refused: ${reason}`);
  }
}

const fail = (reason: ReadBodyFailure): Error => new BodyError(reason);

async function reason(promise: Promise<unknown>): Promise<ReadBodyFailure> {
  const error: unknown = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof BodyError)) throw new Error("expected the factory's error");
  return error.reason;
}

describe("readBodyCapped", () => {
  test("returns the UTF-8 text of a body within the cap", async () => {
    const response = new Response(new TextEncoder().encode('{"a":"ž"}'));
    await expect(readBodyCapped(response, 64, fail)).resolves.toBe('{"a":"ž"}');
  });

  test("an absent body is empty text", async () => {
    await expect(readBodyCapped(new Response(null), 8, fail)).resolves.toBe("");
  });

  test("a declared length over the cap fails before reading", async () => {
    let pulled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled = true;
        controller.enqueue(new Uint8Array(4));
        controller.close();
      },
    });
    const response = new Response(stream, { headers: { "content-length": "9" } });
    expect(await reason(readBodyCapped(response, 8, fail))).toBe("too-large");
    expect(pulled).toBe(false);
  });

  test("a streamed body over the cap fails and the stream is cancelled", async () => {
    let cancelled = false;
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(new Uint8Array(4));
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await reason(readBodyCapped(new Response(stream), 10, fail))).toBe("too-large");
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(5);
  });

  test("invalid UTF-8 fails through the factory", async () => {
    const response = new Response(new Uint8Array([0x22, 0xc3, 0x28, 0x22]));
    expect(await reason(readBodyCapped(response, 64, fail))).toBe("not-utf8");
  });
});
