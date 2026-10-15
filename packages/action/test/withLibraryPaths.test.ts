import { describe, expect, test } from "vitest";
import { withLibraryPaths } from "../src/withLibraryPaths.js";

const options = { platform: "linux", cwd: "/work/space" } as const;

describe("withLibraryPaths", () => {
  test("keeps absolute entries outside the workspace, in order, and drops empty, relative and inside ones", () => {
    const env = { LD_LIBRARY_PATH: ":.:rel:/work/space:/work/space/lib:/opt/a::/usr/lib:" };
    expect(withLibraryPaths(env, options)).toEqual({ LD_LIBRARY_PATH: "/opt/a:/usr/lib" });
  });

  test("filters the DYLD variables and leaves other variables alone", () => {
    const env = {
      DYLD_LIBRARY_PATH: "/a:.",
      DYLD_FALLBACK_LIBRARY_PATH: "/b:",
      HOME: "/h",
    };
    expect(withLibraryPaths(env, { platform: "darwin", cwd: "/work/space" })).toEqual({
      DYLD_LIBRARY_PATH: "/a",
      DYLD_FALLBACK_LIBRARY_PATH: "/b",
      HOME: "/h",
    });
  });

  test("drops a variable with nothing left and does not add absent ones", () => {
    const env = { LD_LIBRARY_PATH: ":.:/work/space/x", HOME: "/h" };
    expect(withLibraryPaths(env, options)).toEqual({ HOME: "/h" });
    expect(withLibraryPaths({}, options)).toEqual({});
  });

  test("leaves win32 untouched", () => {
    const env = { LD_LIBRARY_PATH: ".:", DYLD_LIBRARY_PATH: "" };
    expect(withLibraryPaths(env, { platform: "win32", cwd: "C:\\work" })).toEqual(env);
  });
});
