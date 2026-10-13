import { goldenTest } from "../src/node/index.js";
import suite from "./self.golden.js";

goldenTest(suite, import.meta.url);
