// The renderer's test fixtures import their JPEGs with ?inline (see renderer/test/assets.d.ts).
declare module "*?inline" {
  const dataUri: string;
  export default dataUri;
}

// Vite gives the URL of a file it serves (the browser test fetches the WebAssembly modules from there).
declare module "*.wasm?url" {
  const url: string;
  export default url;
}
