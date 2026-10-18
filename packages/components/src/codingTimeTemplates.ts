/**
 * The coding-time templates, each a plain v0 design at `@readmint/components/templates/<name>.design.json` that renders
 * `wakatime.*` of the WakaTime source in a light or dark theme (docs/components.md). Their fonts sit in
 * `templates/fonts/`.
 */
export const codingTimeTemplates = Object.freeze(["coding-time-card"] as const);

export type CodingTimeTemplate = (typeof codingTimeTemplates)[number];
