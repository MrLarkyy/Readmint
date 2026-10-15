import { goldenTest } from "@readmint/golden/node";
import suite from "./profiles-horizon.golden.js";

goldenTest(suite, import.meta.url);
