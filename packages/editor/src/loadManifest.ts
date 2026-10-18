import { DesignLimits, parseRenderManifest } from "@readmint/format";
import { refuse } from "./commitDesign.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorManifest } from "./EditorManifest.js";
import type { EditorState } from "./EditorState.js";

/**
 * A render manifest (JSON, as `readmint render --manifest`) from its text, at most `maxManifestBytes` of UTF-8,
 * parsed by the format's `parseRenderManifest`. The chosen render stays when the new manifest still has it, else none.
 * A refused manifest leaves the state unchanged; an issue names a pointer, never a prop value.
 */
export function loadManifest(state: EditorState, text: string): EditorState {
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
  const result = parseRenderManifest(text);
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
  const manifest: EditorManifest =
    kept !== undefined && renders.some((entry) => entry.name === kept)
      ? { renders, render: kept }
      : { renders };
  return { ...state, manifest, issues: [] };
}
