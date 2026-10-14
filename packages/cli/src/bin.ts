#!/usr/bin/env node
import { runCli } from "./runCli.js";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    controller.abort();
  });
}

// A failed write (EPIPE) is reported through the write callback; without a listener the stream's error event would crash.
for (const stream of [process.stdout, process.stderr]) stream.on("error", () => undefined);

const write = (stream: NodeJS.WriteStream) => (text: string) =>
  new Promise<void>((resolve, reject) => {
    stream.write(text, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

process.exitCode = await runCli(process.argv.slice(2), {
  stdout: write(process.stdout),
  stderr: write(process.stderr),
  cwd: process.cwd(),
  signal: controller.signal,
});
