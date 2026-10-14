import { goldenTest } from "@readmint/golden/node";
import suite from "./renderer-animation.golden.js";

goldenTest(suite, import.meta.url);
