import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { LaunchPath } from "./LaunchPath.js";
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
  /**
   * When set, every route lives under `/<secret>/` and any other path answers 403: at least 32
   * base64url characters (see `previewSecret`). Never served or put in an error.
   */
  readonly secret?: string;
  /**
   * Needs `secret`, same shape, never equal to it. The first GET of exactly `/<launchToken>` is redirected (303)
   * to `/<secret>/`, so a browser opener's command line never holds the secret; once spent, or with any other
   * method, that path answers like any other path without the secret.
   */
  readonly launchToken?: string;
}

const svgCsp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
const plainCsp = "default-src 'none'";
// Only path-safe characters: the prefix is compared on the raw target, never decoded.
const secretPattern = /^[A-Za-z0-9_-]{32,}$/;

/**
 * The live preview's HTTP server. Listens on 127.0.0.1 only (a literal, never a name or an
 * option); answers only a Host naming that address or localhost with its port (DNS rebinding) and
 * an Origin, when sent, that is this server; serves a fixed set of routes from memory, never a
 * file. With a secret, those routes live only under `/<secret>/`, so a local process or another
 * user of the machine that does not know the printed address reads nothing; a launch token adds one
 * single-use path that leads there.
 */
export class PreviewServer {
  readonly #server: Server;
  readonly #clients = new Set<ServerResponse>();
  readonly #maxClients: number;
  readonly #keepAliveMs: number;
  #keepAlive: NodeJS.Timeout | undefined;
  readonly #prefix: Buffer | undefined;
  readonly #secret: string | undefined;
  readonly #launch: LaunchPath | undefined;
  #hosts: ReadonlySet<string> = new Set();
  #origins: ReadonlySet<string> = new Set();
  #svg: string | undefined;
  #status: PreviewStatus = { version: 0, ok: false, issues: [] };

  constructor(options: PreviewServerOptions = {}) {
    this.#maxClients = options.maxClients ?? 8;
    this.#keepAliveMs = options.keepAliveMs ?? 15_000;
    if (options.secret !== undefined && !secretPattern.test(options.secret)) {
      throw new Error("the preview secret must be at least 32 base64url characters");
    }
    if (options.launchToken !== undefined) {
      if (options.secret === undefined) throw new Error("the preview launch token needs a secret");
      if (!secretPattern.test(options.launchToken)) {
        throw new Error("the preview launch token must be at least 32 base64url characters");
      }
      if (options.launchToken === options.secret) {
        throw new Error("the preview launch token must differ from the secret");
      }
    }
    this.#secret = options.secret;
    this.#prefix = options.secret === undefined ? undefined : Buffer.from(`/${options.secret}`);
    this.#launch =
      options.launchToken === undefined ? undefined : new LaunchPath(options.launchToken);
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
    this.#origins = new Set([...this.#hosts].map((host) => `http://${host}`));
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
    const origin = request.headers.origin;
    if (
      !this.#hosts.has((request.headers.host ?? "").toLowerCase()) ||
      isCrossSite(request) ||
      (origin !== undefined && !this.#origins.has(origin.toLowerCase()))
    ) {
      send(response, 403, "text/plain", "forbidden\n");
      return;
    }
    const target = withoutQuery(request.url ?? "");
    // Spent synchronously before any answer: of two racing GETs only the first one is redirected. Any
    // other request to the launch path falls through and is answered like an unknown path.
    if (request.method === "GET" && this.#launch?.take(target) === true) {
      send(response, 303, "text/plain", "see other\n", { Location: `/${this.#secret ?? ""}/` });
      return;
    }
    // Before the method and the event-stream limit: a request without the secret learns nothing
    // and cannot take a slot.
    const path = this.#route(target);
    if (path === undefined) {
      send(response, 403, "text/plain", "forbidden: open the address the preview printed\n");
      return;
    }
    // A request under the secret shows it was learned from the printed address or the redirect: the
    // launch address, possibly readable in an opener's command line, is no longer needed.
    this.#launch?.discard();
    if (request.method !== "GET" && request.method !== "HEAD") {
      send(response, 405, "text/plain", "method not allowed\n", { Allow: "GET, HEAD" });
      return;
    }
    switch (path) {
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

  /**
   * The route of a raw path (a target without its query); with a secret, what follows exactly
   * `/<secret>`, or undefined when the path does not start with it and a slash.
   */
  #route(path: string): string | undefined {
    const prefix = this.#prefix;
    if (prefix === undefined) return path;
    const bytes = Buffer.from(path);
    // The length is public; the bytes are compared in constant time.
    if (bytes.length <= prefix.length || bytes[prefix.length] !== 0x2f) return undefined;
    if (!timingSafeEqual(bytes.subarray(0, prefix.length), prefix)) return undefined;
    // The prefix is ASCII, so its byte count is its character count.
    return path.slice(prefix.length);
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

// The raw target, not a normalised URL: "/a/../status" and "/%2e%2e/" match no route.
function withoutQuery(target: string): string {
  const query = target.indexOf("?");
  return query === -1 ? target : target.slice(0, query);
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
