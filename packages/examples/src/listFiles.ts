import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assertNoLink } from "./assertNoLink.js";

/** Every file below `dir`, as POSIX paths relative to it, sorted. A symbolic link anywhere below throws. */
export function listFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const name of readdirSync(join(dir, relative)).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      const path = relative === "" ? name : `${relative}/${name}`;
      assertNoLink(join(dir, path));
      if (lstatSync(join(dir, path)).isDirectory()) walk(path);
      else found.push(path);
    }
  };
  walk("");
  return found;
}
