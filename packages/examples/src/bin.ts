#!/usr/bin/env node
import { runExamples } from "./runExamples.js";

process.exitCode = runExamples(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
