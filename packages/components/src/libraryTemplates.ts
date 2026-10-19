/**
 * The library templates, each a plain v0 design at `@readmint/components/templates/<name>.design.json` that renders
 * `registry.*` of the registry source in a light or dark theme (docs/components.md). Their fonts sit in
 * `templates/fonts/`.
 */
export const libraryTemplates = Object.freeze(["libraries-card"] as const);

export type LibraryTemplate = (typeof libraryTemplates)[number];
