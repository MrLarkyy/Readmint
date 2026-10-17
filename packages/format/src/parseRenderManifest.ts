import type { ComponentPropScalar, ComponentPropValue } from "./Design.js";
import type { DesignIssue } from "./DesignIssue.js";
import type { DesignResult } from "./DesignResult.js";
import { designFailure } from "./designFailure.js";
import { IssueCollector } from "./IssueCollector.js";
import { isPlainObject } from "./isPlainObject.js";
import { jsonPointer } from "./jsonPointer.js";
import { parseJsonText } from "./parseJsonText.js";
import type { RenderManifest, RenderManifestEntry } from "./RenderManifest.js";
import { RenderManifestLimits } from "./RenderManifestLimits.js";
import { renderVariant, type RenderVariant, renderVariants } from "./RenderVariant.js";
import { isWindowsDeviceName } from "./windowsDeviceName.js";

const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const idRule = "an id (a letter, then letters, digits, _ or -; at most 64)";
const designExtension = /\.(?:json|ya?ml)$/iu;
// eslint-disable-next-line no-control-regex
const forbiddenInPath = /[\\:*?"<>|\u0000-\u001f\u007f]/u;
const entryKeys = new Set(["name", "design", "props", "variants"]);

/**
 * Render manifest text (JSON) to `RenderManifest`. Messages quote keys and names, never a prop value; a design path
 * is checked lexically here (relative, `/`-separated, no `..`), the file system checks follow in the loader.
 */
export function parseRenderManifest(source: string): DesignResult<RenderManifest> {
  if (typeof source !== "string") {
    return fail({ path: "", code: "type", message: "expected the manifest source text" });
  }
  if (source.length > RenderManifestLimits.maxSourceLength) {
    return fail({
      path: "",
      code: "too-large",
      message: `the manifest source is longer than ${String(RenderManifestLimits.maxSourceLength)} characters`,
    });
  }
  const parsed = parseJsonText(source.startsWith("﻿") ? source.slice(1) : source);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  if (!isPlainObject(root)) return fail({ path: "", code: "type", message: "expected an object" });
  const issues = new IssueCollector();
  for (const key of Object.keys(root)) {
    if (key === "renders") continue;
    if (key === "$schema") {
      const value = root[key];
      if (typeof value !== "string" || value.length > 512) {
        issues.add({
          path: "/$schema",
          code: "type",
          message: "expected a string of at most 512 characters",
        });
      }
      continue;
    }
    issues.add(unknownKey(jsonPointer("", key), key));
  }
  const list = root["renders"];
  const renders: RenderManifestEntry[] = [];
  if (!Array.isArray(list)) {
    issues.add({
      path: "/renders",
      code: list === undefined ? "missing-property" : "type",
      message: "expected a list of renders",
    });
  } else if (list.length === 0) {
    issues.add({ path: "/renders", code: "count", message: "the manifest lists no render" });
  } else if (list.length > RenderManifestLimits.maxRenders) {
    issues.add({
      path: "/renders",
      code: "count",
      message: `the manifest lists ${String(list.length)} renders; at most ${String(RenderManifestLimits.maxRenders)}`,
    });
  } else {
    const names = new Set<string>();
    list.forEach((item: unknown, index) => {
      if (issues.isFull()) return;
      const entry = readEntry(item, `/renders/${String(index)}`, names, issues);
      if (entry !== undefined) renders.push(entry);
    });
  }
  if (!issues.isEmpty) return designFailure(issues.issues, issues.truncated) as DesignResult<never>;
  return { ok: true, value: { renders } };
}

function readEntry(
  item: unknown,
  at: string,
  names: Set<string>,
  issues: IssueCollector,
): RenderManifestEntry | undefined {
  if (!isPlainObject(item)) {
    issues.add({ path: at, code: "type", message: "expected an object" });
    return undefined;
  }
  let ok = true;
  for (const key of Object.keys(item)) {
    if (!entryKeys.has(key)) {
      issues.add(unknownKey(jsonPointer(at, key), key));
      ok = false;
    }
  }
  const name = item["name"];
  const design = item["design"];
  if (typeof name !== "string") {
    issues.add({
      path: `${at}/name`,
      code: name === undefined ? "missing-property" : "type",
      message: "the render needs a name",
    });
    ok = false;
  } else if (!idPattern.test(name) || isWindowsDeviceName(name)) {
    issues.add({
      path: `${at}/name`,
      code: "pattern",
      message: `the name must be ${idRule} and no Windows device name`,
    });
    ok = false;
  } else if (names.has(name.toLowerCase())) {
    issues.add({
      path: `${at}/name`,
      code: "duplicate-name",
      message: `the name ${name} is used twice (letter case is ignored)`,
    });
    ok = false;
  } else {
    names.add(name.toLowerCase());
  }
  if (typeof design !== "string") {
    issues.add({
      path: `${at}/design`,
      code: design === undefined ? "missing-property" : "type",
      message: "the render needs a design file",
    });
    ok = false;
  } else {
    const problem = designProblem(design);
    if (problem !== undefined) {
      issues.add({
        path: `${at}/design`,
        code: "pattern",
        message: `the design must be a relative path inside the manifest folder: ${problem}`,
      });
      ok = false;
    }
  }
  const props = readProps(item["props"], `${at}/props`, issues);
  const variants = readVariants(item["variants"], `${at}/variants`, issues);
  if (props === undefined || variants === null) ok = false;
  if (props !== undefined && variants !== null && variants !== undefined) {
    for (const variant of variants) {
      for (const prop of Object.keys(variant.props)) {
        if (!Object.hasOwn(props, prop)) continue;
        issues.add({
          path: jsonPointer(`${at}/props`, prop),
          code: "duplicate-key",
          message: `the prop ${prop} is also set by the ${variant.name} variant; set it in one place`,
        });
        ok = false;
      }
    }
  }
  if (!ok || typeof name !== "string" || typeof design !== "string" || props === undefined) {
    return undefined;
  }
  return { name, design, props, ...(variants === undefined ? {} : { variants }) };
}

function designProblem(design: string): string | undefined {
  if (design === "" || design.length > RenderManifestLimits.maxDesignLength) {
    return `1 to ${String(RenderManifestLimits.maxDesignLength)} characters`;
  }
  if (design.startsWith("/") || /^[A-Za-z]:/u.test(design)) return "not absolute";
  if (forbiddenInPath.test(design) || /\p{Cs}/u.test(design)) {
    return "no backslash or special character";
  }
  const segments = design.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "no empty, . or .. segment";
  }
  if (segments.some((segment) => /[. ]$/u.test(segment) || isWindowsDeviceName(segment))) {
    return "no segment ending in a dot or space, no Windows device name";
  }
  if (!designExtension.test(design)) return "a .json, .yaml or .yml file";
  return undefined;
}

function readProps(
  value: unknown,
  at: string,
  issues: IssueCollector,
): Record<string, ComponentPropValue> | undefined {
  const props = Object.create(null) as Record<string, ComponentPropValue>;
  if (value === undefined) return props;
  if (!isPlainObject(value)) {
    issues.add({ path: at, code: "type", message: "expected an object of props" });
    return undefined;
  }
  const keys = Object.keys(value);
  if (keys.length > RenderManifestLimits.maxPropsPerRender) {
    issues.add({
      path: at,
      code: "count",
      message: `the render sets ${String(keys.length)} props; at most ${String(RenderManifestLimits.maxPropsPerRender)}`,
    });
    return undefined;
  }
  if (JSON.stringify(value).length > RenderManifestLimits.maxPropsLength) {
    issues.add({
      path: at,
      code: "too-large",
      message: `the props are longer than ${String(RenderManifestLimits.maxPropsLength)} characters`,
    });
    return undefined;
  }
  let ok = true;
  for (const prop of keys) {
    const propAt = jsonPointer(at, prop);
    const entry = value[prop];
    if (!idPattern.test(prop)) {
      issues.add({ path: propAt, code: "pattern", message: `the prop name must be ${idRule}` });
      ok = false;
    } else if (isScalar(entry)) {
      props[prop] = entry;
    } else if (Array.isArray(entry) && (entry as unknown[]).every(isScalar)) {
      props[prop] = entry as ComponentPropScalar[];
    } else {
      issues.add({
        path: propAt,
        code: "type",
        message: "expected a string, number, boolean or a list of those",
      });
      ok = false;
    }
  }
  return ok ? props : undefined;
}

/** `undefined`: absent; `null`: invalid (reported). */
function readVariants(
  value: unknown,
  at: string,
  issues: IssueCollector,
): readonly RenderVariant[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.add({ path: at, code: "type", message: "expected a list of variant names" });
    return null;
  }
  const found: RenderVariant[] = [];
  let ok = true;
  for (const [index, item] of (value as unknown[]).entries()) {
    const variant = typeof item === "string" ? renderVariant(item) : undefined;
    if (variant === undefined) {
      issues.add({
        path: `${at}/${String(index)}`,
        code: "enum",
        message: `a variant must be one of: ${renderVariants.map((known) => known.name).join(", ")}`,
      });
      ok = false;
    } else if (found.includes(variant)) {
      issues.add({
        path: `${at}/${String(index)}`,
        code: "duplicate-name",
        message: `the variant ${variant.name} is listed twice`,
      });
      ok = false;
    } else {
      found.push(variant);
    }
  }
  return ok ? found : null;
}

function isScalar(value: unknown): value is ComponentPropScalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function unknownKey(path: string, key: string): DesignIssue {
  return {
    path,
    code: "unknown-property",
    message: `the key ${idPattern.test(key) ? key : "(not shown)"} is not part of the manifest format`,
  };
}

function fail(issue: DesignIssue): DesignResult<RenderManifest> {
  return { ok: false, issues: [issue], truncated: false };
}
