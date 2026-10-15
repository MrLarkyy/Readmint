// The renderer's test fixtures import their JPEGs with ?inline (see renderer/test/assets.d.ts).
declare module "*?inline" {
  const dataUri: string;
  export default dataUri;
}
