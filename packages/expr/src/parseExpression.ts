import { createError, type ErrorSite } from "./createError.js";
import type { ExpressionError, ExpressionErrorCode } from "./ExpressionError.js";
import { ExpressionLimits } from "./ExpressionLimits.js";
import type { BinaryOperator, ChainLink, ExprNode, FilterCall, PathStep } from "./ExprNode.js";
import type { ExprResult } from "./ExprResult.js";
import { filterRegistry } from "./FilterRegistry.js";
import type { Span } from "./Span.js";
import { shortenName } from "./shortenName.js";
import type { Operator, Token } from "./Token.js";

const equalityOperators: ReadonlySet<Operator> = new Set(["==", "!="]);
const comparisonOperators: ReadonlySet<Operator> = new Set(["<", "<=", ">", ">="]);
const additiveOperators: ReadonlySet<Operator> = new Set(["+", "-"]);
const multiplicativeOperators: ReadonlySet<Operator> = new Set(["*", "/", "%"]);

/**
 * Parses the tokens of one placeholder (ending with its `}}`) by recursive descent. Precedence from
 * low to high: `|`, `? :`, `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* / %`, unary `! -`, then
 * `.name` and `[key]`. Every recursion that can nest without bound is counted against `maxDepth`,
 * so a hostile input fails with `too-deep` long before the native stack runs out.
 */
export function parseExpression(tokens: readonly Token[], site: ErrorSite): ExprResult<ExprNode> {
  try {
    return { ok: true, value: new Parser(tokens, site).parsePlaceholder() };
  } catch (thrown) {
    if (thrown instanceof ParseFailure) return { ok: false, error: thrown.error };
    throw thrown;
  }
}

/** Unwinds the recursive descent to `parseExpression`; never escapes it. */
class ParseFailure extends Error {
  constructor(readonly error: ExpressionError) {
    super(error.message);
  }
}

class Parser {
  private position = 0;
  private depth = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly site: ErrorSite,
  ) {}

  parsePlaceholder(): ExprNode {
    if (this.peek().kind === "close") this.fail("syntax", "empty placeholder", this.peek());
    const node = this.parsePipe();
    const rest = this.peek();
    if (rest.kind !== "close") this.fail("syntax", `unexpected ${describe(rest)}`, rest);
    return node;
  }

  private parsePipe(): ExprNode {
    const input = this.parseConditional();
    const filters: FilterCall[] = [];
    while (this.isOperator("|")) {
      this.next();
      filters.push(this.parseFilterCall());
    }
    const last = filters.at(-1);
    if (last === undefined) return input;
    return { kind: "pipe", input, filters, start: input.start, end: last.end };
  }

  private parseFilterCall(): FilterCall {
    const nameToken = this.next();
    if (nameToken.kind !== "name") {
      return this.fail("syntax", "expected a filter name after |", nameToken);
    }
    const name = nameToken.value;
    const definition = filterRegistry.get(name);
    if (definition === undefined) {
      return this.fail("unknown-filter", `unknown filter ${shortenName(name)}`, nameToken);
    }
    const args: ExprNode[] = [];
    let end = nameToken.end;
    if (this.isOperator("(")) {
      this.enter(this.next());
      if (!this.isOperator(")")) {
        for (;;) {
          const argument = this.parsePipe();
          args.push(argument);
          if (args.length > ExpressionLimits.maxFilterArgs) {
            const limit = String(ExpressionLimits.maxFilterArgs);
            this.fail("argument", `a filter takes at most ${limit} arguments`, argument);
          }
          if (!this.isOperator(",")) break;
          this.next();
        }
      }
      end = this.expect(")").end;
      this.leave();
    }
    if (args.length < definition.minArgs || args.length > definition.maxArgs) {
      const { minArgs, maxArgs } = definition;
      const count =
        minArgs === maxArgs ? String(minArgs) : `${String(minArgs)} to ${String(maxArgs)}`;
      this.fail("argument", `${name} takes ${count} argument(s)`, { start: nameToken.start, end });
    }
    return { name, args, start: nameToken.start, end };
  }

  private parseConditional(): ExprNode {
    const test = this.parseLogical("||");
    if (!this.isOperator("?")) return test;
    this.enter(this.next());
    const consequent = this.parseConditional();
    this.expect(":");
    const alternate = this.parseConditional();
    this.leave();
    return {
      kind: "conditional",
      test,
      consequent,
      alternate,
      start: test.start,
      end: alternate.end,
    };
  }

  private parseLogical(operator: "&&" | "||"): ExprNode {
    const operand = (): ExprNode =>
      operator === "||" ? this.parseLogical("&&") : this.parseChain(equalityOperators);
    const first = operand();
    if (!this.isOperator(operator)) return first;
    const operands = [first];
    while (this.isOperator(operator)) {
      this.next();
      operands.push(operand());
    }
    const end = operands[operands.length - 1]?.end ?? first.end;
    return { kind: "logical", operator, operands, start: first.start, end };
  }

  private parseChain(operators: ReadonlySet<Operator>): ExprNode {
    const operand = (): ExprNode => {
      if (operators === equalityOperators) return this.parseChain(comparisonOperators);
      if (operators === comparisonOperators) return this.parseChain(additiveOperators);
      if (operators === additiveOperators) return this.parseChain(multiplicativeOperators);
      return this.parseUnary();
    };
    const first = operand();
    const links: ChainLink[] = [];
    for (;;) {
      const token = this.peek();
      if (token.kind !== "operator" || !operators.has(token.value)) break;
      this.next();
      const right = operand();
      links.push({
        operator: token.value as BinaryOperator,
        operand: right,
        start: token.start,
        end: right.end,
      });
    }
    const last = links.at(-1);
    if (last === undefined) return first;
    return { kind: "chain", first, links, start: first.start, end: last.end };
  }

  private parseUnary(): ExprNode {
    const token = this.peek();
    if (token.kind !== "operator" || (token.value !== "!" && token.value !== "-")) {
      return this.parsePostfix();
    }
    this.next();
    this.enter(token);
    const operand = this.parseUnary();
    this.leave();
    return { kind: "unary", operator: token.value, operand, start: token.start, end: operand.end };
  }

  private parsePostfix(): ExprNode {
    const target = this.parsePrimary();
    const steps: PathStep[] = [];
    for (;;) {
      if (this.isOperator(".")) {
        const dot = this.next();
        const name = this.next();
        if (name.kind !== "name") this.fail("syntax", "expected a property name after .", name);
        steps.push({ kind: "property", name: name.value, start: dot.start, end: name.end });
      } else if (this.isOperator("[")) {
        const open = this.next();
        this.enter(open);
        const key = this.parsePipe();
        const close = this.expect("]");
        this.leave();
        steps.push({ kind: "index", key, start: open.start, end: close.end });
      } else if (this.isOperator("(")) {
        this.fail(
          "syntax",
          "only filters can be called: write value | name(arguments)",
          this.peek(),
        );
      } else {
        break;
      }
    }
    const last = steps.at(-1);
    if (last === undefined) return target;
    return { kind: "path", target, steps, start: target.start, end: last.end };
  }

  private parsePrimary(): ExprNode {
    const token = this.next();
    const span = { start: token.start, end: token.end };
    if (token.kind === "number" || token.kind === "string") {
      return { kind: "literal", value: token.value, ...span };
    }
    if (token.kind === "name") {
      if (token.value === "true") return { kind: "literal", value: true, ...span };
      if (token.value === "false") return { kind: "literal", value: false, ...span };
      if (token.value === "null") return { kind: "literal", value: null, ...span };
      return { kind: "name", name: token.value, ...span };
    }
    if (token.kind === "operator" && token.value === "(") {
      this.enter(token);
      const inner = this.parsePipe();
      this.expect(")");
      this.leave();
      return inner;
    }
    if (token.kind === "operator" && token.value === "[") {
      this.enter(token);
      const items: ExprNode[] = [];
      if (!this.isOperator("]")) {
        for (;;) {
          items.push(this.parsePipe());
          if (!this.isOperator(",")) break;
          this.next();
        }
      }
      const close = this.expect("]");
      this.leave();
      return { kind: "array", items, start: token.start, end: close.end };
    }
    return this.fail("syntax", `unexpected ${describe(token)}`, token);
  }

  private peek(): Token {
    const token = this.tokens[this.position];
    if (token === undefined) throw new Error("token list must end with }}");
    return token;
  }

  /** Never moves past the closing `}}`, so every lookahead stays inside the list. */
  private next(): Token {
    const token = this.peek();
    if (token.kind !== "close") this.position++;
    return token;
  }

  private isOperator(operator: Operator): boolean {
    const token = this.peek();
    return token.kind === "operator" && token.value === operator;
  }

  private expect(operator: Operator): Token {
    const token = this.peek();
    if (token.kind !== "operator" || token.value !== operator) {
      return this.fail("syntax", `expected "${operator}" but found ${describe(token)}`, token);
    }
    return this.next();
  }

  private enter(at: Span): void {
    this.depth++;
    if (this.depth > ExpressionLimits.maxDepth) {
      const limit = String(ExpressionLimits.maxDepth);
      this.fail("too-deep", `expression nests deeper than ${limit} levels`, at);
    }
  }

  private leave(): void {
    this.depth--;
  }

  private fail(code: ExpressionErrorCode, message: string, span: Span): never {
    throw new ParseFailure(
      createError(this.site, code, message, { start: span.start, end: span.end }),
    );
  }
}

function describe(token: Token): string {
  switch (token.kind) {
    case "number":
      return "number";
    case "string":
      return "string";
    case "name":
      return `name ${shortenName(token.value)}`;
    case "operator":
      return `"${token.value}"`;
    case "close":
      return "end of placeholder }}";
  }
}
