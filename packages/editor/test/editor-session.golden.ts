import { defineGoldenSuite } from "@readmint/golden";
import { renderPreview, type PreviewInput } from "../src/index.js";
import { editorSession } from "./editorSession.js";
import { goldenFonts } from "./testFonts.js";

/** The editor's preview render of a design made through its commands; a failed render fails the test. */
function render(input: PreviewInput): string {
  const result = renderPreview(input);
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  return result.svg;
}

export default defineGoldenSuite<PreviewInput>({
  name: "editor-session",
  render,
  fonts: goldenFonts,
  fixtures: [
    { name: "session-font", input: editorSession(), scale: 2 },
    { name: "session-restricted-font", input: editorSession(true), scale: 2 },
  ],
});
