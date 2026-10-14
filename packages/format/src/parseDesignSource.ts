import { parseDocument, type YAMLError } from "yaml";
import type { DesignIssue } from "./DesignIssue.js";
import type { DesignResult } from "./DesignResult.js";
import { DesignLimits } from "./DesignLimits.js";
import { IssueCollector } from "./IssueCollector.js";
import { LineIndex } from "./LineIndex.js";
import { scanJson } from "./scanJson.js";

export type DesignSourceFormat = "json" | "yaml";

const yamlMessages: Partial<Record<YAMLError["code"], string>> = {
  DUPLICATE_KEY: "duplicate key",
  MULTIPLE_DOCS: "the source holds more than one YAML document",
  TAG_RESOLVE_FAILED: "unknown YAML tag",
  NON_STRING_KEY: "keys must be plain strings",
  RESOURCE_EXHAUSTION: `objects and arrays nest deeper than ${String(DesignLimits.maxDepth)} levels`,
};

/**
 * Source text to a plain value. Auto format: JSON when the first non-whitespace character is `{`,
 * else YAML. Issues found here carry line and column; their path is the root.
 */
export function parseDesignSource(
  source: string,
  format?: DesignSourceFormat,
): DesignResult<unknown> {
  if (typeof source !== "string")
    return failure([{ path: "", code: "type", message: "expected the design source text" }]);
  if (source.length > DesignLimits.maxSourceLength)
    return failure([
      {
        path: "",
        code: "too-large",
        message: `the source is longer than ${String(DesignLimits.maxSourceLength)} characters`,
      },
    ]);
  const text = source.startsWith("\ufeff") ? source.slice(1) : source;
  const chosen = format ?? (/^\s*\{/u.test(text) ? "json" : "yaml");
  return chosen === "json" ? parseJson(text) : parseYaml(text);
}

function parseJson(text: string): DesignResult<unknown> {
  const issues = new IssueCollector();
  const valid = scanJson(text, new LineIndex(text), issues);
  if (!valid || !issues.isEmpty) return failure(issues.issues, issues.truncated);
  return { ok: true, value: JSON.parse(text) as unknown };
}

function parseYaml(text: string): DesignResult<unknown> {
  const document = parseDocument(text, {
    version: "1.2",
    schema: "core",
    merge: false,
    uniqueKeys: true,
    stringKeys: true,
    resolveKnownTags: false,
    prettyErrors: false,
    // "silent" would also drop the multiple-documents error; "error" only mutes console output.
    logLevel: "error",
  });
  const all = [...document.errors, ...document.warnings].sort((a, b) => a.pos[0] - b.pos[0]);
  // Running out of stack leaves a trail of follow-up errors; the nesting is the one cause.
  const exhausted = all.find((problem) => problem.code === "RESOURCE_EXHAUSTION");
  const problems = exhausted === undefined ? all : [exhausted];
  if (problems.length > 0) {
    const lines = new LineIndex(text);
    const issues = new IssueCollector();
    for (const problem of problems) {
      issues.add({
        path: "",
        code: yamlIssueCode(problem.code),
        message: yamlMessages[problem.code] ?? `invalid YAML (${problem.code.toLowerCase()})`,
        ...lines.at(problem.pos[0]),
      });
    }
    return failure(issues.issues, issues.truncated);
  }
  try {
    return { ok: true, value: document.toJS({ maxAliasCount: DesignLimits.maxAliasCount }) };
  } catch (error) {
    if (error instanceof RangeError)
      return failure([
        { path: "", code: "too-deep", message: yamlMessages.RESOURCE_EXHAUSTION ?? "" },
      ]);
    if (error instanceof ReferenceError && error.message.startsWith("Excessive alias"))
      return failure([
        {
          path: "",
          code: "too-large",
          message: `YAML aliases expand beyond ${String(DesignLimits.maxAliasCount)} uses`,
        },
      ]);
    if (error instanceof ReferenceError)
      return failure([{ path: "", code: "parse", message: "invalid YAML alias" }]);
    throw error;
  }
}

function yamlIssueCode(code: YAMLError["code"]): DesignIssue["code"] {
  if (code === "DUPLICATE_KEY") return "duplicate-key";
  return code === "RESOURCE_EXHAUSTION" ? "too-deep" : "parse";
}

function failure(issues: readonly DesignIssue[], truncated = false): DesignResult<unknown> {
  return { ok: false, issues, truncated };
}
