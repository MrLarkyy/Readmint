import { goldenTest } from "@readmint/golden/node";
import suite from "./libraries.golden.js";

goldenTest(suite, import.meta.url);
