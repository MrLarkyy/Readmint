const commandsAndNumbers = "MmLlHhVvCcSsQqTtAaZz0-9eE.,+\\s-";

/**
 * Path data of format v0, shared by the schema (a literal `d`, and the text around the placeholders of a template
 * `d`) and the renderer (what a template evaluates to), so the two cannot drift.
 */
export const PathData = Object.freeze({
  /** Only commands, numbers, separators and whitespace: nothing that could end the attribute or add markup. */
  pattern: `^[${commandsAndNumbers}]+$`,
  /** UTF-16 code units of literal path data, and of what a template evaluates to. */
  maxLength: 100_000,
  /**
   * A template `d`: path data characters around `{{ }}` placeholders, at least one placeholder. A placeholder here
   * ends at the first `}}`, so a `}}` inside a string literal of a placeholder is refused, never misread.
   */
  templatePattern: `^(?=[\\s\\S]*\\{\\{)(?:[${commandsAndNumbers}]|\\{\\{(?:(?!\\}\\})[\\s\\S])+\\}\\})+$`,
  /** A template is compiled as an expression text, which takes at most 10000 code points (`ExpressionLimits`). */
  maxTemplateLength: 10_000,
});

/** A `d` with a placeholder is a template: evaluated as text, then held to `PathData.pattern` and `maxLength`. */
export function isPathTemplate(d: string): boolean {
  return d.includes("{{");
}
