// Vite inlines these imports as base64 data URIs in both the Node and the browser test project.
declare module "*?inline" {
  const dataUri: string;
  export default dataUri;
}

// The committed snapshots of the animated SVGs, read as text in both projects.
declare module "*.svg?raw" {
  const source: string;
  export default source;
}
