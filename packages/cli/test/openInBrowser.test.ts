import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { previewSecret } from "../src/previewSecret.js";
import { openInBrowser } from "../src/openInBrowser.js";

const address = "http://127.0.0.1:4870/";
const launchToken = previewSecret();
const launchAddress = `http://127.0.0.1:4870/${launchToken}`;

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
  ["win32", "C:\\Windows\\System32\\rundll32.exe", ["url.dll,FileProtocolHandler"]],
  ["darwin", "open", []],
  ["linux", "xdg-open", []],
] as const)(
  "%s runs %s with the address as one argument, no shell",
  async (platform, command, before) => {
    for (const url of [address, launchAddress]) {
      const { child, calls, fake } = stub();
      const opened = openInBrowser(url, { platform, spawn: fake, env: {} });
      child.emit("spawn");
      await opened;
      expect(calls).toEqual([
        {
          command,
          args: [...before, url],
          options: { detached: true, stdio: "ignore", shell: false, windowsHide: true },
        },
      ]);
      expect(child.unref).toHaveBeenCalledOnce();
    }
  },
);

test("accepts the launch address", async () => {
  const { child, fake } = stub();
  const opened = openInBrowser(launchAddress, { platform: "linux", spawn: fake });
  child.emit("spawn");
  await opened;
});

test("a start failure rejects with the code and without the address", async () => {
  const { child, fake } = stub();
  const opened = openInBrowser(launchAddress, { platform: "linux", spawn: fake });
  child.emit(
    "error",
    Object.assign(new Error(`spawn xdg-open ${launchAddress}`), { code: "ENOENT" }),
  );
  const error = (await opened.catch((caught: unknown) => caught)) as Error & { code?: string };
  expect(error.code).toBe("ENOENT");
  expect(JSON.stringify(error) + error.message).not.toContain(launchToken);
});

test.each([
  "file:///x",
  "-a x",
  "http://evil.example/",
  "http://127.0.0.1:1/x/",
  `${address} `,
  // The secret address shape: the secret must never reach an opener's command line.
  `${launchAddress}/`,
  launchAddress.slice(0, -1),
  `${launchAddress}x`,
  `${launchAddress}?v=1`,
])("refuses %s without spawning", async (url) => {
  const { calls, fake } = stub();
  await expect(openInBrowser(url, { platform: "linux", spawn: fake })).rejects.toThrow();
  expect(calls).toEqual([]);
});

test.each([
  [{ SystemRoot: "D:\\WinNT" }, "D:\\WinNT\\System32\\rundll32.exe"],
  [{ SystemRoot: "relative" }, "C:\\Windows\\System32\\rundll32.exe"],
  [{ SystemRoot: ".\\x" }, "C:\\Windows\\System32\\rundll32.exe"],
  [{ SystemRoot: "\\evil" }, "C:\\Windows\\System32\\rundll32.exe"],
  [{}, "C:\\Windows\\System32\\rundll32.exe"],
])("the Windows opener is the full path for %o", async (env, expected) => {
  const { child, calls, fake } = stub();
  const opened = openInBrowser(address, { platform: "win32", spawn: fake, env });
  child.emit("spawn");
  await opened;
  expect(calls[0]?.command).toBe(expected);
});
