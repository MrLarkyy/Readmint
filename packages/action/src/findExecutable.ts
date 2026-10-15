import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";

export interface FindExecutableOptions {
  /** Picks the path rules and the file name (`git.exe` on win32), never the host's. */
  readonly platform: NodeJS.Platform;
  /** The environment the program will run with; its `PATH` is searched. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The directory the program will run in; nothing inside it is searched. */
  readonly cwd: string;
  /** Whether a candidate file can be started; a regular (and on POSIX executable) file by default. */
  readonly isExecutable?: (file: string) => Promise<boolean>;
}

/**
 * The absolute path of program `name` on `PATH`, or `undefined`. Only absolute `PATH` entries outside `cwd` are
 * searched: Windows looks in the current directory before `PATH` when given a bare name, and on any system an empty,
 * `.` or relative entry resolves against it, so a program committed to the workspace would run with the job's
 * credentials. On win32 only `<name>.exe` is considered (a `.cmd` or `.bat` needs a shell).
 */
export async function findExecutable(
  name: string,
  options: FindExecutableOptions,
): Promise<string | undefined> {
  const win32 = options.platform === "win32";
  const paths = win32 ? path.win32 : path.posix;
  const isExecutable = options.isExecutable ?? (win32 ? isFile : isExecutableFile);
  const searchPath = win32 ? windowsPath(options.env) : options.env["PATH"];
  if (searchPath === undefined) return undefined;
  const cwd = paths.resolve(options.cwd);
  const file = win32 ? `${name}.exe` : name;
  for (const raw of searchPath.split(paths.delimiter)) {
    const entry = win32 ? unquote(raw) : raw;
    if (!(win32 ? isWindowsAbsolute(entry) : paths.isAbsolute(entry))) continue;
    const dir = paths.resolve(entry);
    if (isInside(paths, cwd, dir)) continue;
    const candidate = paths.join(dir, file);
    if (await isExecutable(candidate)) return candidate;
  }
  return undefined;
}

/** Node keeps the first of case-insensitively equal keys in sorted order when it builds a Windows environment. */
function windowsPath(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const key = Object.keys(env)
    .sort()
    .find((candidate) => candidate.toUpperCase() === "PATH");
  return key === undefined ? undefined : env[key];
}

function unquote(entry: string): string {
  return entry.length >= 2 && entry.startsWith('"') && entry.endsWith('"')
    ? entry.slice(1, -1)
    : entry;
}

/** Drive-absolute (`C:\`) or UNC (`\\host\share`); `path.win32.isAbsolute` also accepts `\x`, which follows the cwd's drive. */
function isWindowsAbsolute(entry: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(entry) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(entry);
}

function isInside(paths: path.PlatformPath, parent: string, child: string): boolean {
  const relative = paths.relative(parent, child);
  if (relative === "") return true;
  if (relative === ".." || relative.startsWith(`..${paths.sep}`)) return false;
  return !paths.isAbsolute(relative);
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function isExecutableFile(file: string): Promise<boolean> {
  if (!(await isFile(file))) return false;
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
