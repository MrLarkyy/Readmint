import { goldenTest } from "@readmint/golden/node";
import suite from "./renderer-images.golden.js";

goldenTest(suite, import.meta.url);
