import { DesignLimits, parseRenderManifest } from "@readmint/format";
import { chooseRender } from "./chooseRender.js";
import { refuse } from "./commitDesign.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorState } from "./EditorState.js";
import { designFileOf } from "./rendersOfFile.js";

/**
 * A render manifest (JSON, as `readmint render --manifest`) from its text, at most `maxManifestBytes` of UTF-8,
 * parsed by the format's `parseRenderManifest`. The chosen render stays when the new manifest still has it and it still names `designFile` (its variant and section follow the rules of `chooseRender`), else none, as choosing none.
 * A refused manifest leaves the state unchanged; an issue names a pointer, never a prop value.
 */
export function loadManifest(state: EditorState, text: string, designFile?: string): EditorState {
  if (text.length * 3 > EditorLimits.maxManifestBytes) {
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > EditorLimits.maxManifestBytes) {
      return refuse(
        state,
        "manifest",
        `manifest is larger than ${String(EditorLimits.maxManifestBytes)} bytes`,
      );
    }
  }
  // The CLI strips a BOM before it counts characters.
  const result = parseRenderManifest(text.startsWith("﻿") ? text.slice(1) : text);
  if (!result.ok) {
    const issues = result.issues.slice(0, DesignLimits.maxIssues).map((issue) => ({
      source: "manifest" as const,
      message: `manifest ${issue.path === "" ? "/" : issue.path}: ${issue.message}`,
      path: issue.path,
    }));
    if (result.truncated || result.issues.length > DesignLimits.maxIssues) {
      issues.push({ source: "manifest", message: "manifest: more issues not shown", path: "" });
    }
    return { ...state, issues };
  }
  const renders = result.value.renders;
  const kept = state.manifest?.render;
  const reloaded = { ...state, manifest: { renders }, issues: [] };
  if (kept === undefined) return reloaded;
  const entry = renders.find((one) => one.name === kept);
  // The chosen render stays only if it still renders this design file, under the rules of choosing it.
  if (
    entry !== undefined &&
    designFile !== undefined &&
    designFileOf(entry.design) === designFile
  ) {
    return chooseRender(reloaded, kept, designFile);
  }
  return chooseRender(reloaded, undefined, designFile);
}
