// Vite turns these imports into the URL of the emitted file, on the app's own origin.
declare module "*.wasm?url" {
  const url: string;
  export default url;
}
