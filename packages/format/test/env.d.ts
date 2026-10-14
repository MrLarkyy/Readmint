// Vite query imports used to read fixtures in both the Node and the browser project.
declare module "*?raw" {
  const source: string;
  export default source;
}

interface ImportMetaEnv {
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
