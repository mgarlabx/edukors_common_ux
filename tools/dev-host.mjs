#!/usr/bin/env node
// Development host: serves the demo on 127.0.0.1 and connects its AI screens to the AI runtime
// (src/ai/runtime) until the Electron host exists. The page talks to the same dispatcher the
// Electron host will use (src/ai/runtime/host/dispatcher.js); only the transport differs:
//
//   GET  /ai/events?token=…              server-sent events, one dispatcher per page; the first
//                                        event is { connection }, then the protocol's messages
//   POST /ai/send?connection=…           one protocol message (JSON), header X-Edukors-Token
//
// Safety: binds to 127.0.0.1 only, checks the Host header (DNS rebinding) and the Origin, and
// requires a random token created at start. The token reaches the page only through the
// address printed in the terminal (#ai=…), which the page keeps for the session.
//
// Usage: node tools/dev-host.mjs [--port 8765] [--shared | --data-dir <dir>] [--verbose]
//   --shared  use the account registry shared by every EDUKORS app on this computer (the real
//             accounts of the Slides and Graph editors). Without it, accounts live in a separate
//             development folder next to the shared one ("EDUKORS-dev"), and the deterministic
//             fake provider is offered as well.
//   --data-dir  accounts and this app's AI settings in another folder (automated tests use a
//             temporary one, so they never touch the person's accounts).
//
// Account folders hold the providers' credentials and this repository may sit in a synced
// folder (Dropbox), so nothing of the AI data is written inside the repository.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createAiRuntime } from "../src/ai/runtime/engine.js";
import { bundledProviders } from "../src/ai/runtime/providers.js";
import { defaultDataDir } from "../src/ai/runtime/platform/paths.js";
import { createHostDispatcher } from "../src/ai/runtime/host/dispatcher.js";
import { createAppMethods } from "../src/ai/host/app-methods.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP_ID = "common";
const { values } = parseArgs({
  options: {
    port: { type: "string", default: "8765" },
    shared: { type: "boolean", default: false },
    "data-dir": { type: "string" },
    verbose: { type: "boolean", default: false },
  },
});
const PORT = Number(values.port);
const SHARED = values.shared && !values["data-dir"];
const SHARED_DIR = defaultDataDir();
const DEV_DIR = join(dirname(SHARED_DIR), `${basename(SHARED_DIR)}-dev`);
const CUSTOM_DIR = values["data-dir"] ? resolve(values["data-dir"]) : null;
const DATA_DIR = CUSTOM_DIR ?? (SHARED ? SHARED_DIR : DEV_DIR);
// The app's own AI settings (instructions, MCP servers, which may hold keys): never in the repository.
const SETTINGS_FILE = join(CUSTOM_DIR ?? DEV_DIR, "apps", APP_ID, "ai-settings.json");
const SKILLS_DIR = join(ROOT, "demo", "skills");
const TOKEN = randomBytes(24).toString("base64url");
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ORIGINS = new Set([...HOSTS].map((h) => `http://${h}`));
const SERVED = ["demo", "src"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".woff2": "font/woff2" };

const connections = new Map();
let nextConnection = 1;

function log(level, message) {
  if (values.verbose || level === "warn" || level === "error") process.stderr.write(`[${level}] ${message}\n`);
}

function openConnection(res) {
  const id = String(nextConnection++);
  const ai = createAiRuntime({
    appId: APP_ID,
    providers: bundledProviders({ fake: !SHARED }),
    dataDir: DATA_DIR,
    logSink: (entry) => log(entry.level, `${entry.scope}: ${entry.message}`),
  });
  const send = (message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
  send({ connection: id });
  const methods = createAppMethods({ appId: APP_ID, dataDir: DATA_DIR, sharedRegistry: SHARED, settingsFile: SETTINGS_FILE, skillsDir: SKILLS_DIR, workspacesDir: join(CUSTOM_DIR ?? DEV_DIR, "apps", APP_ID, "workspaces"), log: ai.diagnostics.scoped("app") });
  const dispatcher = createHostDispatcher({ ai, send, methods });
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 20_000);
  connections.set(id, dispatcher);
  log("info", `page ${id} connected`);
  res.on("close", () => {
    clearInterval(keepAlive);
    connections.delete(id);
    void dispatcher.close().then(() => log("info", `page ${id} closed`));
  });
}

function refuse(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

async function serveFile(res, pathname) {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const top = relativePath.split("/")[0];
  if (!SERVED.includes(top) || relativePath.split("/").some((part) => part.startsWith("."))) return refuse(res, 404, "Not found");
  let file = resolve(ROOT, relativePath);
  if (!file.startsWith(join(ROOT, top) + sep) && file !== join(ROOT, top)) return refuse(res, 404, "Not found");
  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      file = join(file, "index.html");
      info = await stat(file);
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "content-length": info.size, "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  } catch {
    refuse(res, 404, "Not found");
  }
}

// Requests may carry attached files (base64): up to 20 files of 20 MB.
function readBody(req, limit = 600 << 20) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (!HOSTS.has(req.headers.host ?? "")) return refuse(res, 421, "Wrong host");
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/ai/events" && req.method === "GET") {
    if (url.searchParams.get("token") !== TOKEN) return refuse(res, 403, "Forbidden");
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
    return openConnection(res);
  }
  if (url.pathname === "/ai/send") {
    if (req.method !== "POST") return refuse(res, 405, "Method not allowed");
    if (req.headers["x-edukors-token"] !== TOKEN) return refuse(res, 403, "Forbidden");
    if (req.headers.origin && !ORIGINS.has(req.headers.origin)) return refuse(res, 403, "Forbidden");
    const dispatcher = connections.get(url.searchParams.get("connection") ?? "");
    if (!dispatcher) return refuse(res, 410, "Connection closed");
    let message;
    try {
      message = JSON.parse(await readBody(req));
    } catch {
      return refuse(res, 400, "Invalid message");
    }
    dispatcher.receive(message);
    res.writeHead(204, { "cache-control": "no-store" });
    return res.end();
  }
  if (req.method !== "GET" && req.method !== "HEAD") return refuse(res, 405, "Method not allowed");
  if (url.pathname === "/") {
    res.writeHead(302, { location: "/demo/" });
    return res.end();
  }
  return serveFile(res, url.pathname);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    [
      "",
      "EDUKORS Common: development host",
      `  Open:     http://127.0.0.1:${PORT}/demo/#ai=${TOKEN}`,
      `  Accounts: ${SHARED ? "the registry shared by every EDUKORS app (--shared)" : CUSTOM_DIR ? "the folder given with --data-dir" : "a development registry, separate from the other apps, with the fake provider"}`,
      `            ${DATA_DIR}`,
      `  Settings: ${SETTINGS_FILE}`,
      `  Skills:   ${SKILLS_DIR}`,
      "  Stop with Ctrl+C.",
      "",
    ].join("\n") + "\n",
  );
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await Promise.allSettled([...connections.values()].map((d) => d.close()));
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
