import { createHash } from "node:crypto";

// The page shows issues through textContent only: they quote design and data values. Its URLs are
// relative, so the same page works at "/" and under the --github secret prefix.
const script = `const image = document.getElementById("render");
const issues = document.getElementById("issues");
let shown = -1;
async function refresh() {
  const response = await fetch("status", { cache: "no-store" });
  if (!response.ok) {
    issues.textContent = await response.text();
    image.hidden = true;
    shown = -1;
    return;
  }
  const status = await response.json();
  issues.textContent = status.issues.join("\\n");
  if (status.version !== shown) {
    shown = status.version;
    image.src = "render.svg?v=" + String(status.version);
  }
}
image.addEventListener("load", () => { image.hidden = false; });
image.addEventListener("error", () => { image.hidden = true; });
const events = new EventSource("events");
events.addEventListener("reload", () => { refresh().catch(() => {}); });
// A refused stream (a tab of an earlier run, whose secret is gone) never reconnects: say why.
events.addEventListener("error", () => {
  if (events.readyState === EventSource.CLOSED) refresh().catch(() => {});
});
refresh().catch(() => {});
`;

const style = `body { margin: 0; padding: 16px; font: 14px system-ui, sans-serif; background: #f6f8fa; color: #1f2328; }
pre { margin: 0 0 16px; color: #cf222e; white-space: pre-wrap; }
img { display: block; max-width: 100%; background: repeating-conic-gradient(#d0d7de 0 25%, #ffffff 0 50%) 0 0 / 16px 16px; }
`;

const hash = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

/** The preview page: the current render as an image, reloaded on every change event. */
export const previewPage = Object.freeze({
  html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Readmint preview</title>
<style>${style}</style>
</head>
<body>
<pre id="issues"></pre>
<img id="render" alt="rendered design" hidden>
<script>${script}</script>
</body>
</html>
`,
  csp: [
    "default-src 'none'",
    `script-src ${hash(script)}`,
    `style-src ${hash(style)}`,
    "img-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
});
