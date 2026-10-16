import type { WikiGroup, WikiPage } from "./WikiPage.js";

/** The groups of the wiki, in reading order. */
export const wikiGroups: readonly WikiGroup[] = [
  { id: "start", title: "Start here", summary: "from nothing to a rendered design in your README" },
  { id: "guides", title: "Guides", summary: "how to do one thing well" },
  { id: "reference", title: "Reference", summary: "the formats and languages, exactly" },
  { id: "contributors", title: "Contributors", summary: "working on Readmint itself" },
];

/**
 * Every published page, grouped (the order inside a group is the order here). Page names are wiki URLs: a renamed
 * page breaks every link to it, so a name changes only with a redirect-equivalent note in docs/wiki-publishing.md.
 */
export const wikiPages: readonly WikiPage[] = [
  {
    source: "getting-started.md",
    name: "Getting-started",
    title: "Getting started",
    group: "start",
    summary: "a design, a workflow, a README snippet, and the examples repository",
  },
  {
    source: "action.md",
    name: "GitHub-Action",
    title: "GitHub Action",
    group: "guides",
    summary: "inputs, outputs, pushing, errors, releases",
  },
  {
    source: "components.md",
    name: "Components-and-templates",
    title: "Components and templates",
    group: "guides",
    summary: "the starter templates and the contribution calendar",
  },
  {
    source: "cli.md",
    name: "CLI",
    title: "CLI",
    group: "guides",
    summary: "render, validate and preview on your machine",
  },
  {
    source: "editor.md",
    name: "Editor",
    title: "Editor",
    group: "guides",
    summary: "the visual editor",
  },
  {
    source: "fonts.md",
    name: "Fonts-and-licensing",
    title: "Fonts and licensing",
    group: "guides",
    summary: "your own fonts and when they are embedded",
  },
  {
    source: "asset-loading.md",
    name: "Asset-loading",
    title: "Asset loading",
    group: "guides",
    summary: "which files and images a design may load",
  },
  {
    source: "troubleshooting.md",
    name: "Troubleshooting",
    title: "Troubleshooting",
    group: "guides",
    summary: "common failures and where to look",
  },
  {
    source: "design-format.md",
    name: "Design-format",
    title: "Design format",
    group: "reference",
    summary: "layers, assets, animation, JSON Schema, versioning",
  },
  {
    source: "expressions.md",
    name: "Expressions",
    title: "Expressions",
    group: "reference",
    summary: "placeholders, filters and functions",
  },
  {
    source: "data-sources.md",
    name: "Data-sources",
    title: "Data sources",
    group: "reference",
    summary: "the data object a design binds to",
  },
  {
    source: "data-github.md",
    name: "GitHub-data",
    title: "GitHub data",
    group: "reference",
    summary: "what the GitHub source provides, privacy, errors",
  },
  {
    source: "raster.md",
    name: "Output-formats",
    title: "Output formats",
    group: "reference",
    summary: "SVG, PNG, WebP, APNG and GIF",
  },
  {
    source: "renderer.md",
    name: "Renderer",
    title: "Renderer",
    group: "reference",
    summary: "how a design becomes an SVG",
  },
  {
    source: "golden-tests.md",
    name: "Golden-tests",
    title: "Golden tests",
    group: "contributors",
    summary: "the golden-image and SVG snapshot suites",
  },
  {
    source: "wiki-publishing.md",
    name: "Wiki-publishing",
    title: "Wiki publishing",
    group: "contributors",
    summary: "how these pages are generated and published",
  },
];
