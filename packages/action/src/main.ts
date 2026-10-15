import { initRaster } from "@readmint/raster";
import { runAction } from "./runAction.js";
import { runGit } from "./runGit.js";

process.exitCode = await runAction(process.env, {
  write: (text) => {
    process.stdout.write(text);
  },
  runGit,
  cwd: process.cwd(),
  // The bundle ships the WebAssembly modules in dist/wasm (rolldown.config.ts).
  initRaster: () => initRaster(new URL("./wasm/", import.meta.url)),
});
