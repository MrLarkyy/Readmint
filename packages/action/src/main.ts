import { runAction } from "./runAction.js";
import { runGit } from "./runGit.js";

process.exitCode = await runAction(process.env, {
  write: (text) => {
    process.stdout.write(text);
  },
  runGit,
  cwd: process.cwd(),
});
