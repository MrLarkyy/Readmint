import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";
import { appRasterPins } from "./editorRasterParity.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const configFile = join(root, "vite.config.ts");
const font = fileURLToPath(
  new URL("../../renderer/test/fonts/Montserrat-Medium.ttf", import.meta.url),
);

/** A cold worker and the lazy font parser load over a real server: allow for a slow machine. */
const wait = { timeout: 30_000 };
/** Building the app, starting and closing Chromium take far over the 10 s hook default; a cold build up to a minute. */
const hookTimeoutMs = 120_000;

let outDir: string;
let server: PreviewServer;
let browser: Browser;
let url: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "readmint-editor-app-"));
  await build({ root, configFile, logLevel: "silent", build: { outDir, emptyOutDir: true } });
  server = await preview({
    root,
    configFile,
    logLevel: "silent",
    build: { outDir },
    preview: { port: 0, host: "127.0.0.1" },
  });
  url = server.resolvedUrls?.local[0] ?? "";
  browser = await chromium.launch();
}, hookTimeoutMs);

afterAll(async () => {
  await browser.close();
  await server.close();
  await rm(outDir, { recursive: true, force: true });
}, hookTimeoutMs);

test("the built app works under its Content-Security-Policy, which blocks inline script", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { violations: string[] }).violations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  await page.goto(url);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("connect-src 'none'");

  const preview = page.locator('img[alt="Preview"]');
  const shown = async () =>
    preview.evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0 ? image.src : "",
    );
  await expect.poll(shown, wait).toMatch(/^blob:/u);
  const empty = await shown();
  await page.locator('[data-action="add-rect"]').click();
  await expect.poll(shown, wait).not.toBe(empty);

  // The font parser loads on demand, the text renders in the worker with the font embedded.
  await page.locator('input[data-action="upload-font"]').setInputFiles(font);
  await expect.poll(() => page.locator("[data-font]").count(), wait).toBe(1);
  const withRect = await shown();
  await page.locator('[data-action="add-text"]').click();
  await expect.poll(shown, wait).not.toBe(withRect);
  const svg = await page.evaluate(
    async (src) => {
      const response = await fetch(src).catch(() => undefined);
      return response === undefined ? "blocked" : "fetched";
    },
    await shown(),
  );
  // connect-src 'none': not even the page's own blob URL can be fetched.
  expect(svg).toBe("blocked");

  expect(errors).toEqual([]);
  const violations = () =>
    page.evaluate(() => (window as unknown as { violations: string[] }).violations);
  expect((await violations()).filter((entry) => !entry.startsWith("connect-src"))).toEqual([]);

  const ran = await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.inlineRan = true";
    document.body.append(script);
    return (window as unknown as { inlineRan?: boolean }).inlineRan === true;
  });
  expect(ran).toBe(false);
  await expect
    .poll(async () => (await violations()).some((entry) => entry.startsWith("script-src")), wait)
    .toBe(true);
  await page.close();
});

test("the built app exports the CLI's PNG and WebP from its raster worker without a policy violation", async () => {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { violations: string[] }).violations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  await page.goto(url);
  await page.locator('input[data-action="upload-font"]').setInputFiles(font);
  await expect.poll(() => page.locator("[data-font]").count(), wait).toBe(1);
  await page.locator('[data-action="add-text"]').click();
  const preview = page.locator('img[alt="Preview"]');
  await expect
    .poll(
      () => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      wait,
    )
    .toBe(true);

  for (const format of ["png", "webp"] as const) {
    const [download] = await Promise.all([
      page.waitForEvent("download", wait),
      page.locator(`[data-action="export-${format}"]`).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`design.${format}`);
    const path = await download.path();
    const sha = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
    expect(sha).toBe(appRasterPins[format]);
  }

  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as { violations: string[] }).violations),
  ).toEqual([]);
  await page.close();
});

test("the built app ships both WebAssembly files and the licence notices they need", async () => {
  const assets = await readdir(join(outDir, "assets"));
  expect(assets.filter((name) => name.endsWith(".wasm"))).toHaveLength(2);
  expect(await readdir(join(outDir, "licences"))).toEqual(["THIRD-PARTY.txt"]);
  const notices = await readFile(join(outDir, "licences", "THIRD-PARTY.txt"), "utf8");
  for (const name of ["fflate", "gifenc", "yaml", "@resvg/resvg-wasm", "wasm-webp"]) {
    expect(notices, name).toContain(`Package: ${name}@`);
  }
  // The wasm-only notices: the Rust crates in resvg.wasm, libwebp's copyright and patent grant.
  expect(notices).toContain("Mozilla Public License");
  expect(notices).toContain("Additional IP Rights Grant");
});
