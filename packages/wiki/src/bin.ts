#!/usr/bin/env node
import { writeWiki } from "./writeWiki.js";

const [docsDir, outDir, repository = "https://github.com/MrLarkyy/Readmint", branch = "main"] =
  process.argv.slice(2);
if (docsDir === undefined || outDir === undefined) {
  process.stderr.write("usage: readmint-wiki <docs dir> <output dir> [repository url] [branch]\n");
  process.exitCode = 2;
} else {
  const written = writeWiki(docsDir, outDir, { repository, branch });
  process.stdout.write(`wrote ${String(written.length)} wiki files to ${outDir}\n`);
}
