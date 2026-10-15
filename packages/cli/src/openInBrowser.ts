import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";
import { previewSecretLength } from "./previewSecret.js";

export interface OpenInBrowserOptions {
  readonly platform?: NodeJS.Platform;
  readonly spawn?: typeof nodeSpawn;
  /** Where `SystemRoot` is read from (Windows opener path); `process.env` when absent. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** The only shapes `preview` prints: plain, and under the 43-character session secret. */
const previewAddress = new RegExp(
  String.raw`^http://127\.0\.0\.1:\d{1,5}/(?:[A-Za-z0-9_-]{${String(previewSecretLength)}}/)?$`,
);

/**
 * Hands a preview address to the default browser: no shell, detached, output ignored, the address one argument.
 * Resolves once the opener started (its exit status is ignored: xdg-open can wait for the browser), rejects when
 * it cannot start. Never logs, and the rejection never holds the address (it may hold the session secret).
 */
export function openInBrowser(url: string, options: OpenInBrowserOptions = {}): Promise<void> {
  if (!previewAddress.test(url)) return Promise.reject(new Error("not a preview address"));
  const platform = options.platform ?? process.platform;
  const spawn = options.spawn ?? nodeSpawn;
  const [command, args] = opener(platform, url, options.env ?? process.env);
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

/** By full path: Windows searches the current directory first, where a downloaded repository could plant a program. */
function rundll32Path(env: Readonly<Record<string, string | undefined>>): string {
  const root = env["SystemRoot"];
  const base = root !== undefined && /^[A-Za-z]:[\\/]/.test(root) ? root : "C:\\Windows";
  return path.win32.join(base, "System32", "rundll32.exe");
}

function opener(
  platform: NodeJS.Platform,
  url: string,
  env: Readonly<Record<string, string | undefined>>,
): readonly [string, readonly string[]] {
  if (platform === "win32") return [rundll32Path(env), ["url.dll,FileProtocolHandler", url]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}
