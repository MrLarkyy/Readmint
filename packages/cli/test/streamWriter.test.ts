import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { expect, test } from "vitest";
import { streamWriter } from "../src/streamWriter.js";

const epipe = () => Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

test("resolves once the text is written", async () => {
  const chunks: string[] = [];
  const write = streamWriter(
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    }),
  );
  await write("a");
  await write("b");
  expect(chunks).toEqual(["a", "b"]);
});

test("a failed write rejects with the system error, and so does every later write", async () => {
  const write = streamWriter(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback(epipe());
      },
    }),
  );
  await expect(write("a")).rejects.toMatchObject({ code: "EPIPE" });
  await expect(write("b")).rejects.toMatchObject({ code: "EPIPE" });
});

test("a stream destroyed by a system error rejects with it, without an uncaught error event", async () => {
  const stream = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const write = streamWriter(stream);
  stream.destroy(epipe());
  await expect(write("a")).rejects.toMatchObject({ code: "EPIPE" });
});

// Node gives a process whose standard output was closed (`>&-`) the null device: POSIX Node reopens
// fd 1 on /dev/null, and on Windows the handle reads as a character device. Writes succeed, so the
// CLI cannot tell; docs/cli.md states the limit. This pins the platform behaviour it rests on.
test("a closed standard output is the null device: writes succeed", async () => {
  const script =
    "process.stdout.write('x', (e) => process.stderr.write(e ? 'error ' + e.code : 'written'))";
  const child =
    process.platform === "win32"
      ? spawn(process.execPath, ["-e", script], { stdio: ["ignore", "ignore", "pipe"] })
      : spawn("/bin/sh", ["-c", 'exec "$0" -e "$1" >&-', process.execPath, script], {
          stdio: ["ignore", "pipe", "pipe"],
        });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (text: string) => (stderr += text));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  expect({ code, stderr }).toEqual({ code: 0, stderr: "written" });
});
