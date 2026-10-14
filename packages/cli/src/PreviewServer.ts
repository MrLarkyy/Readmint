import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { previewPage } from "./previewPage.js";

/** One render as the preview shows it. */
export interface PreviewUpdate {
  /** The new SVG; absent when the render failed: the last good SVG stays. */
  readonly svg?: string;
  /** Escaped issue lines (warnings with an SVG, errors without). */
  readonly issues: readonly string[];
}

export interface PreviewStatus {
  /** Bumped whenever the SVG, the issues or the outcome change; 0 before the first render. */
  readonly version: number;
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export interface PreviewServerOptions {
  /** Event stream clients served at once; default 8. */
  readonly maxClients?: number;
  /** Interval of the keep-alive comment on event streams; default 15 s. */
  readonly keepAliveMs?: number;
}

const svgCsp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
const plainCsp = "default-src 'none'";

/**
 * The live preview's HTTP server. Listens on 127.0.0.1 only (a literal, never a name or an
 * option); answers only a Host naming that address or localhost with its port (DNS rebinding);
 * serves a fixed set of routes from memory, never a file.
 */
export class PreviewServer {
  readonly #server: Server;
  readonly #clients = new Set<ServerResponse>();
  readonly #maxClients: number;
  readonly #keepAliveMs: number;
  #keepAlive: NodeJS.Timeout | undefined;
  #hosts: ReadonlySet<string> = new Set();
  #svg: string | undefined;
  #status: PreviewStatus = { version: 0, ok: false, issues: [] };

  constructor(options: PreviewServerOptions = {}) {
    this.#maxClients = options.maxClients ?? 8;
    this.#keepAliveMs = options.keepAliveMs ?? 15_000;
    this.#server = createServer((request, response) => {
      this.#handle(request, response);
    });
  }

  get status(): PreviewStatus {
    return this.#status;
  }

  /** Starts listening on 127.0.0.1; port 0 picks a free one. Rejects with the listen error (EADDRINUSE). */
  async listen(port: number): Promise<AddressInfo> {
    await new Promise<void>((resolve, reject) => {
      this.#server.once("error", reject);
      this.#server.listen(port, "127.0.0.1", () => {
        this.#server.off("error", reject);
        resolve();
      });
    });
    const address = this.#server.address() as AddressInfo;
    this.#hosts = new Set([
      `127.0.0.1:${String(address.port)}`,
      `localhost:${String(address.port)}`,
    ]);
    this.#keepAlive = setInterval(() => {
      for (const client of this.#clients) client.write(": keep-alive\n\n");
    }, this.#keepAliveMs);
    return address;
  }

  /** Takes a render; returns whether the page changes (then every event client is told to reload). */
  update(update: PreviewUpdate): boolean {
    const svg = update.svg ?? this.#svg;
    const ok = update.svg !== undefined;
    const previous = this.#status;
    const same =
      previous.version > 0 &&
      svg === this.#svg &&
      ok === previous.ok &&
      update.issues.length === previous.issues.length &&
      update.issues.every((line, index) => line === previous.issues[index]);
    if (same) return false;
    this.#svg = svg;
    this.#status = { version: previous.version + 1, ok, issues: [...update.issues] };
    for (const client of this.#clients) {
      client.write(`event: reload\ndata: ${String(this.#status.version)}\n\n`);
    }
    return true;
  }

  /** Ends every event stream and connection, stops the timer and the server. */
  async close(): Promise<void> {
    clearInterval(this.#keepAlive);
    for (const client of this.#clients) client.end();
    this.#clients.clear();
    const closed = new Promise<void>((resolve) => {
      this.#server.close(() => {
        resolve();
      });
    });
    this.#server.closeAllConnections();
    await closed;
  }

  #handle(request: IncomingMessage, response: ServerResponse): void {
    if (!this.#hosts.has((request.headers.host ?? "").toLowerCase()) || isCrossSite(request)) {
      send(response, 403, "text/plain", "forbidden\n");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, "text/plain", "method not allowed\n", { Allow: "GET, HEAD" });
      return;
    }
    // The raw target, not a normalised URL: "/a/../status" and "/%2e%2e/" match no route.
    const target = request.url ?? "";
    const query = target.indexOf("?");
    switch (query === -1 ? target : target.slice(0, query)) {
      case "/":
        send(response, 200, "text/html", previewPage.html, {}, previewPage.csp);
        return;
      case "/render.svg":
        if (this.#svg === undefined)
          send(response, 503, "text/plain", "no successful render yet\n");
        else send(response, 200, "image/svg+xml", this.#svg, {}, svgCsp);
        return;
      case "/status":
        send(response, 200, "application/json", JSON.stringify(this.#status));
        return;
      case "/events":
        this.#openEvents(request, response);
        return;
      default:
        send(response, 404, "text/plain", "not found\n");
    }
  }

  #openEvents(request: IncomingMessage, response: ServerResponse): void {
    if (this.#clients.size >= this.#maxClients) {
      send(response, 503, "text/plain", "too many preview pages open\n");
      return;
    }
    response.writeHead(200, {
      ...commonHeaders(plainCsp),
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.write("retry: 1000\n\n");
    this.#clients.add(response);
    response.on("close", () => {
      this.#clients.delete(response);
    });
  }
}

// Fetch metadata: a page of another site (even one on another localhost port) cannot use the preview.
function isCrossSite(request: IncomingMessage): boolean {
  const site = request.headers["sec-fetch-site"];
  return site !== undefined && site !== "same-origin" && site !== "none";
}

function commonHeaders(csp: string): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": csp,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function send(
  response: ServerResponse,
  status: number,
  type: string,
  body: string,
  headers: Record<string, string> = {},
  csp = plainCsp,
): void {
  response.writeHead(status, {
    ...commonHeaders(csp),
    ...headers,
    "Content-Type": `${type}; charset=utf-8`,
    "Content-Length": String(Buffer.byteLength(body)),
  });
  response.end(body);
}
