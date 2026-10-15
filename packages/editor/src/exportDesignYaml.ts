import { type Design, stringifyDesignYamlAsync } from "@readmint/format";

/** The design file as YAML, or why it cannot be written (over the YAML reader's limit): then JSON is the way. */
export async function exportDesignYaml(
  design: Design,
): Promise<
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string }
> {
  const result = await stringifyDesignYamlAsync(design);
  if (result.ok) return { ok: true, text: result.value };
  return { ok: false, message: result.issues.map((issue) => issue.message).join("; ") };
}
