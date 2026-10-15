import { goldenTest } from "@readmint/golden/node";
import suite from "./renderer-fonts.golden.js";

goldenTest(suite, import.meta.url);
