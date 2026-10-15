import { Composer, Parser, type YAMLError } from "yaml";
import type { DesignResult } from "./DesignResult.js";
import { checkYamlTree } from "./checkYamlTree.js";
import { designFailure } from "./designFailure.js";
import { DesignLimits } from "./DesignLimits.js";
import { findDeepYamlCollection } from "./findDeepYamlCollection.js";
import { IssueCollector } from "./IssueCollector.js";
import { LineIndex } from "./LineIndex.js";

const yamlMessages: Partial<Record<YAMLError["code"], string>> = {
  MULTIPLE_DOCS: "the source holds more than one YAML document",
  TAG_RESOLVE_FAILED: "unknown YAML tag",
  NON_STRING_KEY: "keys must be plain strings",
};

const tooDeep = `objects and arrays nest deeper than ${String(DesignLimits.maxDepth)} levels`;

const yamlOptions = {
  version: "1.2",
  schema: "core",
  merge: false,
  // Pairwise, so quadratic on a large map; checkYamlTree finds duplicates linearly instead.
  uniqueKeys: false,
  stringKeys: true,
  resolveKnownTags: false,
  // Mutes console output only; problems still land in the document's errors.
  logLevel: "error",
} as const;

/** YAML text (already length-checked) to a plain value. */
export function parseYamlText(text: string): DesignResult<unknown> {
  const lines = new LineIndex(text);
  const tokens = [...new Parser().parse(text)];
  const deep = findDeepYamlCollection(tokens);
  if (deep !== undefined)
    return designFailure([{ path: "", code: "too-deep", message: tooDeep, ...lines.at(deep) }]);

  const [document, extra] = withoutStackTraces(() => {
    const documents = [];
    for (const next of new Composer(yamlOptions).compose(tokens, true, text.length)) {
      documents.push(next);
      if (documents.length > 1) break;
    }
    return documents;
  });
  if (document === undefined) throw new Error("yaml composed no document");
  const problems: { code: YAMLError["code"]; offset: number }[] = [
    ...document.errors,
    ...document.warnings,
  ].map((problem) => ({ code: problem.code, offset: problem.pos[0] }));
  if (extra !== undefined) problems.push({ code: "MULTIPLE_DOCS", offset: extra.range[0] });
  problems.sort((a, b) => a.offset - b.offset);
  const issues = new IssueCollector();
  if (problems.length > 0) {
    for (const problem of problems) {
      if (issues.isFull()) break;
      issues.add({
        path: "",
        code: "parse",
        message: yamlMessages[problem.code] ?? `invalid YAML (${problem.code.toLowerCase()})`,
        ...lines.at(problem.offset),
      });
    }
    return designFailure(issues.issues, issues.truncated);
  }
  checkYamlTree(document, lines, issues);
  if (!issues.isEmpty) return designFailure(issues.issues, issues.truncated);
  try {
    // No alias count: yaml would walk the whole document per alias. maxAliases bounds the aliases,
    // toJS shares each anchored value, and measureValue bounds the expanded size.
    return { ok: true, value: document.toJS({ maxAliasCount: -1 }) };
  } catch (error) {
    if (error instanceof RangeError)
      return designFailure([{ path: "", code: "too-deep", message: tooDeep }]);
    if (error instanceof ReferenceError)
      return designFailure([{ path: "", code: "parse", message: "invalid YAML alias" }]);
    throw error;
  }
}

/**
 * yaml builds an Error per syntax problem, and a source of nothing but stray commas holds one per
 * character: capturing a stack trace for each made 1 MiB of them take 9 s or more instead of 1 s.
 */
function withoutStackTraces<T>(run: () => T): T {
  // Reflect, because stackTraceLimit is a V8 extension the ES2023 library (the package build) does not declare.
  const saved: unknown = Reflect.get(Error, "stackTraceLimit");
  // Left alone when hardened (frozen intrinsics, SES).
  const property = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
  if (property?.writable !== true || typeof saved !== "number") return run();
  Reflect.set(Error, "stackTraceLimit", 0);
  try {
    return run();
  } finally {
    Reflect.set(Error, "stackTraceLimit", saved);
  }
}
