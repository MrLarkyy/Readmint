/** A design path relative to the working folder as messages name it: relative to `root`, the manifest's folder. */
export function designNameIn(root: string | undefined, design: string): string {
  return root === undefined || root === "." ? design : design.slice(root.length + 1);
}
