import { goldenTest } from "@readmint/golden/node";
import suite from "./coding-time.golden.js";

goldenTest(suite, import.meta.url);
