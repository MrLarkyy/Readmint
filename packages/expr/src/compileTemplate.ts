import { createBudget } from "./Budget.js";
import { failWith, type ErrorSite } from "./createError.js";
import { evaluateNode, type EvalContext } from "./evaluate.js";
import { ExpressionLimits } from "./ExpressionLimits.js";
import type { ExprResult } from "./ExprResult.js";
import type { ExprValue } from "./ExprValue.js";
import { parseExpression } from "./parseExpression.js";
import type { Scope } from "./Scope.js";
import type { Template, TemplatePart } from "./Template.js";
import { textSteps } from "./textSteps.js";
import { tokenize } from "./tokenize.js";
import { toText } from "./toText.js";
import { typeName } from "./typeName.js";

/**
 * Compiles a design string: literal text with `{{ expression }}` placeholders. The closing `}}` is
 * found by the tokenizer, so `}}` inside a string literal does not end a placeholder; a `}}`
 * outside any placeholder is literal text, and a literal `{{` is written `{{ "{{" }}`.
 */
export function compileTemplate(text: string): ExprResult<Template> {
  const whole = { start: 0, end: text.length };
  const overflow = overflowAt(text);
  if (overflow !== undefined) {
    const limit = String(ExpressionLimits.maxSourceLength);
    return failWith(
      { source: text, segment: whole },
      "too-long",
      `text is longer than ${limit} characters`,
      { start: overflow, end: text.length },
    );
  }
  const parts: TemplatePart[] = [];
  let position = 0;
  while (position < text.length) {
    const open = text.indexOf("{{", position);
    if (open === -1) {
      parts.push({ kind: "text", text: text.slice(position) });
      break;
    }
    if (open > position) parts.push({ kind: "text", text: text.slice(position, open) });
    const placeholder = tokenize(text, open + 2);
    if (!placeholder.ok) return placeholder;
    const segment = { start: open, end: placeholder.value.end };
    const node = parseExpression(placeholder.value.tokens, { source: text, segment });
    if (!node.ok) return node;
    parts.push({ kind: "expression", node: node.value, segment });
    position = segment.end;
  }
  const only = parts.length === 1 ? parts[0] : undefined;
  const kind =
    only?.kind === "expression" && only.segment.start === 0 && only.segment.end === text.length
      ? "expression"
      : "text";
  return {
    ok: true,
    value: Object.freeze({
      source: text,
      kind,
      evaluate: (scope: Scope) => evaluateParts(text, parts, kind === "expression", scope),
    }),
  };
}

function evaluateParts(
  source: string,
  parts: readonly TemplatePart[],
  keepType: boolean,
  scope: Scope,
): ExprResult<ExprValue> {
  const budget = scope.budget ?? createBudget();
  let output = "";
  for (const part of parts) {
    if (part.kind === "text") {
      if (!budget.charge(textSteps(part.text.length))) {
        const limit = String(budget.maxSteps);
        const site: ErrorSite = { source, segment: { start: 0, end: source.length } };
        return failWith(
          site,
          "budget",
          `evaluation exceeded its budget of ${limit} steps`,
          site.segment,
        );
      }
      output += part.text;
      continue;
    }
    const site: ErrorSite = { source, segment: part.segment };
    const context: EvalContext = { site, scope, budget };
    const result = evaluateNode(part.node, context);
    if (!result.ok || keepType) return result;
    const written = toText(result.value);
    if (written === undefined) {
      const got = typeName(result.value);
      return failWith(site, "type", `an ${got} cannot be written into text`, part.segment);
    }
    if (output.length + written.length > ExpressionLimits.maxStringLength) {
      const limit = String(ExpressionLimits.maxStringLength);
      return failWith(
        site,
        "too-large",
        `the text would be longer than ${limit} characters`,
        part.segment,
      );
    }
    if (!budget.charge(textSteps(written.length))) {
      const limit = String(budget.maxSteps);
      return failWith(
        site,
        "budget",
        `evaluation exceeded its budget of ${limit} steps`,
        part.segment,
      );
    }
    output += written;
  }
  return { ok: true, value: output };
}

/**
 * The UTF-16 offset where the code point after the first `maxSourceLength` starts, or undefined for a text within
 * the limit. Counting stops there, so a huge text is refused as fast as a long one.
 */
function overflowAt(text: string): number | undefined {
  const max = ExpressionLimits.maxSourceLength;
  if (text.length <= max) return undefined;
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    if (count === max) return index;
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index++;
    }
    count++;
  }
  return undefined;
}
