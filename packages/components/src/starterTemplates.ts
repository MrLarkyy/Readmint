/**
 * The starter templates, each a plain v0 design at `@readmint/components/templates/<name>.design.json` that renders
 * `github.*` in a light or dark theme (docs/components.md). Their fonts sit in `templates/fonts/`.
 */
export const starterTemplates = Object.freeze([
  "stats-card",
  "isometric-card",
  "banner",
  "language-bars",
  "profile-card",
] as const);

export type StarterTemplate = (typeof starterTemplates)[number];
