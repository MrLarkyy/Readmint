import type { WikiPage } from "./WikiPage.js";

/** The user guide, in sidebar order. A file in docs/ that is not listed here is contributor documentation. */
export const wikiPages: readonly WikiPage[] = [
  {
    source: "action.md",
    name: "GitHub-Action",
    summary: "inputs, outputs, pushing, errors, releases",
  },
  {
    source: "design-format.md",
    name: "Design-format",
    summary: "layers, assets, animation, JSON Schema, versioning",
  },
  { source: "expressions.md", name: "Expressions", summary: "placeholders, filters and functions" },
  {
    source: "components.md",
    name: "Components-and-templates",
    summary: "the starter templates and the contribution calendar",
  },
  {
    source: "data-github.md",
    name: "GitHub-data",
    summary: "what the GitHub source provides, privacy, errors",
  },
  {
    source: "data-sources.md",
    name: "Data-sources",
    summary: "the data object a design binds to",
  },
  { source: "cli.md", name: "CLI", summary: "render, validate and preview" },
  { source: "raster.md", name: "Output-formats", summary: "SVG, PNG, WebP, APNG and GIF" },
  {
    source: "fonts.md",
    name: "Fonts-and-licensing",
    summary: "your own fonts and when they are embedded",
  },
  {
    source: "asset-loading.md",
    name: "Asset-loading",
    summary: "which files and images a design may load",
  },
  { source: "renderer.md", name: "Renderer", summary: "how a design becomes an SVG" },
  { source: "editor.md", name: "Editor", summary: "the visual editor" },
  {
    source: "troubleshooting.md",
    name: "Troubleshooting",
    summary: "common failures and where to look",
  },
];
