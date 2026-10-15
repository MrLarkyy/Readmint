// Vite inlines these imports as base64 data URIs in both the Node and the browser test project.
declare module "*?inline" {
  const dataUri: string;
  export default dataUri;
}
