export type GoldenMode = "check" | "update";

/** Goldens are only ever written when the update command set the variable to exactly "1". */
export function goldenMode(env: Record<string, string | undefined> = process.env): GoldenMode {
  return env["READMINT_GOLDEN_UPDATE"] === "1" ? "update" : "check";
}
