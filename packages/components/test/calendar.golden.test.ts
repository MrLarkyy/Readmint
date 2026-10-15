import { goldenTest } from "@readmint/golden/node";
import suite from "./calendar.golden.js";

goldenTest(suite, import.meta.url);
