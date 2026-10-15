// Vite reads the templates as text in both the Node and the browser test project.
declare module "*?raw" {
  const source: string;
  export default source;
}
