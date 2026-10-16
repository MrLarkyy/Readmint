import type { ComponentPropScalar, ComponentPropValue } from "./Design.js";
import type { DesignIssue } from "./DesignIssue.js";
import { DesignLimits } from "./DesignLimits.js";
import type { DesignProps } from "./DesignProps.js";
import type { DesignResult } from "./DesignResult.js";
import { designFailure } from "./designFailure.js";
import { IssueCollector } from "./IssueCollector.js";
import { isPlainObject } from "./isPlainObject.js";
import { jsonPointer } from "./jsonPointer.js";
import { parseJsonText } from "./parseJsonText.js";

const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;

/**
 * Settings text (JSON) to `DesignProps`: an object of sections, each an object of prop values (a scalar or a list
 * of scalars). Keys follow the format's id pattern; messages never quote a value, only a key.
 */
export function parseDesignProps(source: string): DesignResult<DesignProps> {
  if (typeof source !== "string") {
    return fail({ path: "", code: "type", message: "expected the settings source text" });
  }
  if (source.length > DesignLimits.maxSourceLength) {
    return fail({
      path: "",
      code: "too-large",
      message: `the settings source is longer than ${String(DesignLimits.maxSourceLength)} characters`,
    });
  }
  const parsed = parseJsonText(source.startsWith("﻿") ? source.slice(1) : source);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  if (!isPlainObject(root)) {
    return fail({ path: "", code: "type", message: "expected an object of sections" });
  }
  const issues = new IssueCollector();
  const sections: Record<string, Record<string, ComponentPropValue>> = Object.create(
    null,
  ) as Record<string, Record<string, ComponentPropValue>>;
  for (const [name, section] of Object.entries(root)) {
    if (issues.isFull()) break;
    const at = jsonPointer("", name);
    if (!idPattern.test(name)) {
      issues.add(badKey(at, "section name"));
      continue;
    }
    if (!isPlainObject(section)) {
      issues.add({ path: at, code: "type", message: "expected an object of props" });
      continue;
    }
    const props: Record<string, ComponentPropValue> = Object.create(null) as Record<
      string,
      ComponentPropValue
    >;
    for (const [prop, value] of Object.entries(section)) {
      const propAt = jsonPointer(at, prop);
      if (!idPattern.test(prop)) issues.add(badKey(propAt, "prop name"));
      else if (isScalar(value)) props[prop] = value;
      else if (Array.isArray(value) && (value as unknown[]).every(isScalar))
        props[prop] = value as ComponentPropScalar[];
      else
        issues.add({
          path: propAt,
          code: "type",
          message: "expected a string, number, boolean or a list of those",
        });
    }
    sections[name] = props;
  }
  if (!issues.isEmpty)
    return designFailure(issues.issues, issues.truncated) as DesignResult<DesignProps>;
  return { ok: true, value: sections };
}

function isScalar(value: unknown): value is ComponentPropScalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function badKey(path: string, what: string): DesignIssue {
  return {
    path,
    code: "pattern",
    message: `the ${what} must be an id (a letter, then letters, digits, _ or -; at most 64)`,
  };
}

function fail(issue: DesignIssue): DesignResult<DesignProps> {
  return { ok: false, issues: [issue], truncated: false };
}
