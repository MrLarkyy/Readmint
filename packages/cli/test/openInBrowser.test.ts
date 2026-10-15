import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { openInBrowser } from "../src/openInBrowser.js";

const address = "http://127.0.0.1:4870/";
const secretAddress = `http://127.0.0.1:4870/${"a".repeat(43)}/`;

function stub() {
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  const calls: { command: string; args: readonly string[]; options: unknown }[] = [];
  const fake = ((command: string, args: readonly string[], options: unknown) => {
    calls.push({ command, args, options });
    return child;
  }) as unknown as typeof spawn;
  return { child, calls, fake };
}

test.each([
  ["win32", "rundll32.exe", ["url.dll,FileProtocolHandler", address]],
  ["darwin", "open", [address]],
  ["linux", "xdg-open", [address]],
] as const)(
  "%s runs %s with the address as one argument, no shell",
  async (platform, command, args) => {
    const { child, calls, fake } = stub();
    const opened = openInBrowser(address, { platform, spawn: fake });
    child.emit("spawn");
    await opened;
    expect(calls).toEqual([
      {
        command,
        args,
        options: { detached: true, stdio: "ignore", shell: false, windowsHide: true },
      },
    ]);
    expect(child.unref).toHaveBeenCalledOnce();
  },
);

test("accepts the secret address", async () => {
  const { child, fake } = stub();
  const opened = openInBrowser(secretAddress, { platform: "linux", spawn: fake });
  child.emit("spawn");
  await opened;
});

test("a start failure rejects with the code and without the address", async () => {
  const { child, fake } = stub();
  const opened = openInBrowser(secretAddress, { platform: "linux", spawn: fake });
  child.emit(
    "error",
    Object.assign(new Error(`spawn xdg-open ${secretAddress}`), { code: "ENOENT" }),
  );
  const error = (await opened.catch((caught: unknown) => caught)) as Error & { code?: string };
  expect(error.code).toBe("ENOENT");
  expect(JSON.stringify(error) + error.message).not.toContain("aaaa");
});

test.each(["file:///x", "-a x", "http://evil.example/", "http://127.0.0.1:1/x/", `${address} `])(
  "refuses %s without spawning",
  async (url) => {
    const { calls, fake } = stub();
    await expect(openInBrowser(url, { platform: "linux", spawn: fake })).rejects.toThrow();
    expect(calls).toEqual([]);
  },
);
