export const goldenUpdateMode = "golden-update";

/**
 * Environment handed to every test worker. Only the explicit update mode turns writing on,
 * so a stray READMINT_GOLDEN_UPDATE in the shell never changes a golden during `pnpm test`.
 */
export function goldenEnvironment(
  mode: string,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (mode !== goldenUpdateMode) return { READMINT_GOLDEN_UPDATE: "0" };
  if ((env["CI"] ?? "") !== "")
    throw new Error("pnpm golden:update is refused when CI is set; update goldens locally");
  return { READMINT_GOLDEN_UPDATE: "1" };
}
