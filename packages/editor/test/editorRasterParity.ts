/**
 * SHA-256 of the PNG and WebP the CLI writes for the exported `editorSession` design and its data file
 * (`readmint render design.json --data data.json --format <format> --out ...`). The editor's export must make the
 * same bytes, in Node and in Chromium. A change here is a change of the rasterizer's output and needs a reason.
 */
export const editorRasterPins: Readonly<Record<string, string>> = {
  "font.png": "ed155438b1c8f72a163d8d6812d70e427740afe0de20d26c6d2a2db4e627480c",
  "font.webp": "048326a97b5ffed79f07be3736afb3c2f7c4b213b2b42236ec1142316ec70337",
  "restricted.png": "ed155438b1c8f72a163d8d6812d70e427740afe0de20d26c6d2a2db4e627480c",
  "restricted.webp": "048326a97b5ffed79f07be3736afb3c2f7c4b213b2b42236ec1142316ec70337",
};

export function pinKey(restricted: boolean, format: "png" | "webp"): string {
  return `${restricted ? "restricted" : "font"}.${format}`;
}

/**
 * SHA-256 of the CLI's PNG and WebP of `appSession()`, which the built app's page downloads for its Export PNG and
 * Export WebP buttons.
 */
export const appRasterPins: Readonly<Record<"png" | "webp", string>> = {
  png: "ec3e33035129d2b4121333f7c9b80017d671bbc7b6ce991937724eea2349813d",
  webp: "48e8b4eac602a4168daac4c25f2119120d50028ea7d0188613b2b8f75d08d0d0",
};
