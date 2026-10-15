import { goldenTest } from "@readmint/golden/node";
import suite from "./profiles-year-ring.golden.js";

goldenTest(suite, import.meta.url);
