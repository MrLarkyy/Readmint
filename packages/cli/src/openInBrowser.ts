import { spawn as nodeSpawn } from "node:child_process";

export interface OpenInBrowserOptions {
  readonly platform?: NodeJS.Platform;
  readonly spawn?: typeof nodeSpawn;
}

/** The only shapes `preview` prints: plain, and under the 43-character session secret. */
const previewAddress = /^http:\/\/127\.0\.0\.1:\d{1,5}\/(?:[A-Za-z0-9_-]{43}\/)?$/;

/**
 * Hands a preview address to the default browser: no shell, detached, output ignored, the address one argument.
 * Resolves once the opener started (its exit status is ignored: xdg-open can wait for the browser), rejects when
 * it cannot start. Never logs, and the rejection never holds the address (it may hold the session secret).
 */
export function openInBrowser(url: string, options: OpenInBrowserOptions = {}): Promise<void> {
  if (!previewAddress.test(url)) return Promise.reject(new Error("not a preview address"));
  const platform = options.platform ?? process.platform;
  const spawn = options.spawn ?? nodeSpawn;
  const [command, args] = opener(platform, url);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      shell: false,
      windowsHide: true,
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      const code = error.code;
      reject(
        Object.assign(new Error("cannot start the opener"), code === undefined ? {} : { code }),
      );
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function opener(platform: NodeJS.Platform, url: string): readonly [string, readonly string[]] {
  if (platform === "win32") return ["rundll32.exe", ["url.dll,FileProtocolHandler", url]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}
