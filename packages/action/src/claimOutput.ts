import { quoteForLog } from "@readmint/cli";

/**
 * Records that `owner` writes `output` and adds a problem when another owner writes it too. The comparison ignores
 * letter case: checkouts on Windows and macOS fold it. `kind` names the owners in the message (`designs`, `renders`).
 */
export function claimOutput(
  claims: Map<string, string>,
  problems: string[],
  kind: string,
  owner: string,
  output: string,
): void {
  const key = output.toLowerCase();
  const other = claims.get(key);
  if (other !== undefined && other !== owner) {
    problems.push(
      `${kind} ${quoteForLog(other)} and ${quoteForLog(owner)} both write ${quoteForLog(output)}`,
    );
  }
  claims.set(key, owner);
}
