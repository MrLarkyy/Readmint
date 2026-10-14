import { goldenTest } from "@readmint/golden/node";
import suite from "./renderer-components.golden.js";

goldenTest(suite, import.meta.url);
