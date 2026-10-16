import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { loadJsonData } from "../src/index.js";
import { workspaceFileReader } from "../src/node/index.js";
import { failure } from "./stubFetch.js";

let base: string;
let root: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "readmint-json-"));
  root = join(base, "workspace");
  await mkdir(join(root, "data", "dir.json"), { recursive: true });
  await writeFile(join(root, "data", "ok.json"), '{"inside":true}');
  await writeFile(join(base, "outside.json"), '{"outside":true}');
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

const load = (source: string) => loadJsonData({ source, readFile: workspaceFileReader(root) });

// A link needs a privilege on Windows that a directory junction does not.
async function linkOutside(name: string, target: string): Promise<boolean> {
  try {
    await symlink(target, join(root, name), process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return false;
    throw error;
  }
}

describe("workspaceFileReader", () => {
  test("reads a file inside the root", async () => {
    expect((await load("data/ok.json")).data.document).toEqual({ inside: true });
    expect((await load("data\\ok.json")).data.document).toEqual({ inside: true });
  });

  test.each([
    ["../outside.json"],
    ["data/../../outside.json"],
    ["/etc/passwd"],
    ["\\Windows\\win.ini"],
    ["C:\\Windows\\win.ini"],
    ["c:outside.json"],
    ["\\\\server\\share\\x.json"],
    ["//server/share/x.json"],
    ["\\\\?\\C:\\x.json"],
    ["\\\\.\\PhysicalDrive0"],
    ["data/NUL"],
    ["con.json"],
    ["data/ok.json:stream"],
    ["data/\u0000.json"],
    ["data/\n.json"],
    [""],
  ])("%j is invalid-option before any read", async (source) => {
    const reader = vi.fn(workspaceFileReader(root));
    const error = await failure(loadJsonData({ source, readFile: reader }));
    expect(error.code).toBe("invalid-option");
    expect(reader).not.toHaveBeenCalled();
  });

  test("the reader itself refuses an unchecked path before touching the disk", async () => {
    const read = workspaceFileReader(join(base, "missing-root"));
    const error = await failure(read("../outside.json", 1024));
    expect(error.code).toBe("invalid-option");
    expect(error.message).toContain("leaves the root");
  });

  test("a link to a directory outside the root is forbidden", async (context) => {
    if (!(await linkOutside("escape", base))) {
      context.skip();
      return;
    }
    const error = await failure(load("escape/outside.json"));
    expect(error.code).toBe("forbidden");
    expect(error.message).not.toContain(base);
  });

  test("a directory is invalid-option", async () => {
    const error = await failure(load("data/dir.json"));
    expect(error.code).toBe("invalid-option");
    expect(error.message).toContain("not a regular file");
  });

  test("a missing file is not-found and names the relative path only", async () => {
    const error = await failure(load("data/missing.json"));
    expect(error.code).toBe("not-found");
    expect(error.message).toContain('"data/missing.json"');
    expect(error.message).not.toContain(root);
  });

  test("a file over maxBytes is too-large", async () => {
    const error = await failure(
      loadJsonData({ source: "data/ok.json", readFile: workspaceFileReader(root), maxBytes: 4 }),
    );
    expect(error.code).toBe("too-large");
  });
});
