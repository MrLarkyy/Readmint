import { goldenTest } from "@readmint/golden/node";
import suite from "./editor-session.golden.js";

goldenTest(suite, import.meta.url);
