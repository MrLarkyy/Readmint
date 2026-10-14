#!/usr/bin/env node
import { runCli } from "./runCli.js";
import { streamWriter } from "./streamWriter.js";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    controller.abort();
  });
}

process.exitCode = await runCli(process.argv.slice(2), {
  stdout: streamWriter(process.stdout),
  stderr: streamWriter(process.stderr),
  cwd: process.cwd(),
  signal: controller.signal,
});
