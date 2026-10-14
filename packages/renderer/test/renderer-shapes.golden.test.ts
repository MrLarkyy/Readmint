import { goldenTest } from "@readmint/golden/node";
import suite from "./renderer-shapes.golden.js";

goldenTest(suite, import.meta.url);
