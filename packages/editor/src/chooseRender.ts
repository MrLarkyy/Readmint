import { propsSection } from "@readmint/format";
import { refuse } from "./commitDesign.js";
import type { EditorManifest } from "./EditorManifest.js";
import type { EditorState } from "./EditorState.js";
import { designFileOf } from "./rendersOfFile.js";
import { withSection } from "./settingsSection.js";

/**
 * Applies the named render of the loaded manifest (its props, its variants, its name as the settings section), or none
 * (`undefined`). Refused: no manifest, an unknown render, a render of another design file than `designFile`. The
 * settings section becomes the render's name when the settings file has it, else none (the CLI never falls back to
 * the design file's section for a render); a variant the render does not list is dropped. Choosing none returns to the
 * design file's own section when the settings file has it.
 */
export function chooseRender(
  state: EditorState,
  name: string | undefined,
  designFile?: string,
): EditorState {
  const manifest = state.manifest;
  if (manifest === undefined) return refuse(state, "manifest", "no manifest is loaded");
  if (name === undefined) {
    return withSettingsSection(
      { ...state, manifest: { renders: manifest.renders }, issues: [] },
      designFile === undefined ? undefined : propsSection(designFile),
    );
  }
  const entry = manifest.renders.find((one) => one.name === name);
  if (entry === undefined) {
    return refuse(
      state,
      "manifest",
      `the manifest has no render ${JSON.stringify(name.slice(0, 64))}`,
    );
  }
  const file = designFileOf(entry.design);
  if (designFile !== file) {
    return refuse(
      state,
      "manifest",
      `render ${JSON.stringify(name)} renders design file ${JSON.stringify(file.slice(0, 128))}; import it first`,
    );
  }
  const next: EditorManifest = { renders: manifest.renders, render: name };
  const listed = entry.variants;
  const variant = state.variant;
  const dropped =
    variant !== undefined &&
    listed !== undefined &&
    !listed.some((one) => one.name === variant.name);
  const chosen = { ...state, manifest: next, issues: [] };
  const base = dropped ? withoutVariant(chosen) : chosen;
  return withSettingsSection(base, name);
}

function withoutVariant(state: EditorState): EditorState {
  const copy: { -readonly [K in keyof EditorState]: EditorState[K] } = { ...state };
  delete copy.variant;
  return copy;
}

function withSettingsSection(state: EditorState, name: string | undefined): EditorState {
  const settings = state.settings;
  if (settings === undefined) return state;
  const has = name !== undefined && Object.hasOwn(settings.sections, name);
  return { ...state, settings: withSection(settings, has ? name : undefined) };
}
