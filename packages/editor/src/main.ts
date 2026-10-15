import { mountEditor } from "./mountEditor.js";

const root = document.getElementById("app");
if (root === null) throw new Error("the page has no #app element");
mountEditor(root);
