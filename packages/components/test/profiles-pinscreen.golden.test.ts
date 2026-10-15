import { goldenTest } from "@readmint/golden/node";
import suite from "./profiles-pinscreen.golden.js";

goldenTest(suite, import.meta.url);
