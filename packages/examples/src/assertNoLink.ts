import { lstatSync } from "node:fs";

/** Throws when `path` is a symbolic link: a walk or a delete through one could leave the generated folders. */
export function assertNoLink(path: string): void {
  if (lstatSync(path).isSymbolicLink()) throw new Error(`${path} is a symbolic link; not followed`);
}
