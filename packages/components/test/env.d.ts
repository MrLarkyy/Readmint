// Vite reads the templates as text in both the Node and the browser test project.
declare module "*?raw" {
  const source: string;
  export default source;
}

// Vite inlines these as base64 data URIs in both test projects.
declare module "*?inline" {
  const dataUri: string;
  export default dataUri;
}

// The glob import Vite resolves at build time, in both test projects.
interface ImportMeta {
  glob(
    pattern: string,
    options: { eager: true; query: string; import: "default" },
  ): Record<string, string>;
}
