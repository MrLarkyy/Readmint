import { goldenTest } from "@readmint/golden/node";
import suite from "./renderer-layout.golden.js";

goldenTest(suite, import.meta.url);
