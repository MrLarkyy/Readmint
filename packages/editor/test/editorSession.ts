import {
  addLayer,
  createEditorState,
  loadFixture,
  moveLayer,
  newDesign,
  resizeLayer,
  setLayerProperty,
  uploadFont,
  uploadImage,
  type EditorState,
} from "../src/index.js";
import { testFonts } from "./testFonts.js";
import { testImages } from "./testImages.js";

/** Applies a command and fails loudly when it was refused, so a session never silently skips a step. */
function step(state: EditorState, command: (state: EditorState) => EditorState): EditorState {
  const next = command(state);
  if (next.issues.length > 0)
    throw new Error(`editor command refused: ${JSON.stringify(next.issues)}`);
  return next;
}

/**
 * A design made only through editor commands: a gradient card, a moved group with an ellipse and a turned square,
 * an uploaded font and a text bound to fixture data. `restricted` uploads the font with an fsType that forbids
 * embedding: its text must come out as paths.
 */
export function editorSession(restricted = false): EditorState {
  const font = restricted ? testFonts.restricted : testFonts.ttf;
  const commands: ((state: EditorState) => EditorState)[] = [
    (s) => setLayerProperty(s, "/canvas", "background", "#ffffff"),
    (s) => addLayer(s, "rect"),
    (s) => resizeLayer(s, "/layers/0", { x: 10, y: 10, width: 140, height: 100 }),
    (s) => setLayerProperty(s, "/layers/0", "radius", 12),
    (s) =>
      setLayerProperty(s, "/layers/0", "fill", {
        type: "linear",
        stops: [
          { offset: 0, color: "#8250df" },
          { offset: 1, color: "#e85aad" },
        ],
      }),
    (s) => addLayer(s, "group"),
    (s) => moveLayer(s, "/layers/1", 150.4, -0.6),
    (s) => addLayer(s, "ellipse", "/layers/1"),
    (s) => setLayerProperty(s, "/layers/1/children/0", "fill", "#1a7f37"),
    (s) => addLayer(s, "rect", "/layers/1"),
    (s) => resizeLayer(s, "/layers/1/children/1", { x: 80, y: 10, width: 40, height: 40 }),
    (s) => setLayerProperty(s, "/layers/1/children/1", "rotation", 15),
    (s) => uploadFont(s, font),
    (s) => addLayer(s, "text"),
    (s) => setLayerProperty(s, "/layers/2", "content", "{{repo.name}} by {{repo.owner}}"),
    (s) => moveLayer(s, "/layers/2", 0, 70),
    (s) => loadFixture(s, JSON.stringify({ repo: { name: "readmint", owner: "octo" } })),
  ];
  return commands.reduce(step, createEditorState(newDesign(320, 120)));
}

/**
 * What the built app's page makes by hand: an empty canvas, the test font uploaded and a text layer added. Its raster
 * exports are pinned in `editorRasterParity.ts` like the session's.
 */
export function appSession(): EditorState {
  const commands: ((state: EditorState) => EditorState)[] = [
    (s) => uploadFont(s, testFonts.ttf),
    (s) => addLayer(s, "text"),
  ];
  return commands.reduce(step, createEditorState(newDesign()));
}

/** An uploaded PNG beside a rect, resized to twice its height through the editor's commands. */
export function imageSession(): EditorState {
  const commands: ((state: EditorState) => EditorState)[] = [
    (s) => setLayerProperty(s, "/canvas", "background", "#ffffff"),
    (s) => addLayer(s, "rect"),
    (s) => uploadImage(s, testImages.png),
    (s) => resizeLayer(s, "/layers/1", { x: 170, y: 20, width: 120, height: 80 }),
  ];
  return commands.reduce(step, createEditorState(newDesign(320, 120)));
}
