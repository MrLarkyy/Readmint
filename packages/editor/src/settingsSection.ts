import type { EditorSettings } from "./EditorSettings.js";

/** The settings with `section` applied, or none (`undefined`); every other field is carried along. */
export function withSection(settings: EditorSettings, section: string | undefined): EditorSettings {
  const next: { -readonly [K in keyof EditorSettings]: EditorSettings[K] } = {
    sections: settings.sections,
  };
  if (section !== undefined) next.section = section;
  if (settings.source !== undefined) next.source = settings.source;
  if (settings.loaded !== undefined) next.loaded = settings.loaded;
  return next;
}
