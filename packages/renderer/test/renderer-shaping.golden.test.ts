import { goldenTest } from "@readmint/golden/node";
import suite from "./renderer-shaping.golden.js";

goldenTest(suite, import.meta.url);
