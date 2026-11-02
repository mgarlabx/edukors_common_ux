// Requests of the AI settings screens that belong to the application host rather than to the
// AI library: the app's own AI settings (instructions, MCP servers), checking MCP servers,
// and the app's skills (listed, added from a ZIP, removed). Skills belong to the app, not to a
// document. The development host (tools/dev-host.mjs) adds these to the dispatcher today; the
// Electron host will add the same ones.
//
// Settings 2–4 of the AI settings screen (instructions, MCP servers, skills) belong to each
// app; accounts are shared by every EDUKORS app (see docs/ai.md).
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { parseMcpConfig } from "../runtime/mcp/config.js";
import { ExternalServers } from "../runtime/mcp/external.js";
import { listSkills } from "../runtime/skills.js";
import { PROVIDER_CATALOG, installationCommand } from "../runtime/providerCatalog.js";
import "../../package/package.js"; // EdukorsPackage.unzip, for skills added as ZIP files

// A skill added as a ZIP: at most this many files and bytes, and a folder name the agent can use.
const SKILL_ZIP = { maxEntries: 500, maxEntryBytes: 10 << 20, maxTotalBytes: 25 << 20 };
const SKILL_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// The example offered in Settings → MCP servers: the Edukors book, a remote server reached through mcp-remote.
export const MCP_EXAMPLE = JSON.stringify({ mcpServers: { "edukors-book": { command: "npx", args: ["-y", "mcp-remote", "https://mcp.edukors.org/mcp"] } } }, null, 2);
const skillError = (code, message) => Object.assign(new Error(message), { code });
const fileError = (message) => Object.assign(new Error(message), { code: "INVALID_ARGUMENT" });
const MAX_FILE = 50 << 20;
const MIME = { png: "image/png", apng: "image/apng", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", pdf: "application/pdf", json: "application/json", txt: "text/plain", md: "text/markdown", html: "text/html", csv: "text/csv" };
const mimeOf = (name) => MIME[String(name).split(".").pop().toLowerCase()] || "application/octet-stream";

// mode: "ask" (each change to the document waits for approval) or "auto" (changes apply at once, with Undo).
// choices: the model and effort chosen for each account ({ [accountId]: { model, effort } }), so the model always
// belongs to the account's service.
// web: whether the agent may search the web (on by default; the + menu turns it off).
const DEFAULTS = Object.freeze({ instructions: "", mcp: "", defaultAccountId: null, choices: {}, mode: "ask", web: true });
const LIMITS = { instructions: 20_000, mcp: 100_000 };

/**
 * @param {{ appId: string, dataDir: string, sharedRegistry: boolean, settingsFile: string, skillsDir: string, workspacesDir: string, mcpExample?: string, log?: import("../runtime/diagnostics.js").ScopedLog }} options
 *   workspacesDir: where unsaved documents get their private working folders.
 *   mcpExample: MCP JSON the settings screen offers with "Use example"; by default, the Edukors book server
 *   (MCP_EXAMPLE).
 */
export function createAppMethods({ appId, dataDir, sharedRegistry, settingsFile, skillsDir, workspacesDir, mcpExample = MCP_EXAMPLE, log }) {
  const quiet = log ?? { debug() {}, info() {}, warn() {}, error() {} };
  // The working folder of each document, as prepared for its sessions (workspace.prepare).
  const folders = new Map();

  async function read() {
    try {
      const raw = JSON.parse(await readFile(settingsFile, "utf8"));
      return { ...DEFAULTS, ...pick(raw) };
    } catch (e) {
      if (e?.code !== "ENOENT") quiet.warn("could not read the AI settings; using defaults", { error: String(e?.message ?? e) });
      return { ...DEFAULTS };
    }
  }

  async function write(patch) {
    const next = { ...(await read()), ...pick(patch ?? {}) };
    await mkdir(dirname(settingsFile), { recursive: true });
    const temp = `${settingsFile}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(next, null, 2) + "\n", "utf8");
    await rename(temp, settingsFile);
    return next;
  }

  async function installSkill(fileName, base64, replace) {
    let entries;
    try {
      entries = await globalThis.EdukorsPackage.unzip(Buffer.from(base64, "base64"), SKILL_ZIP);
    } catch (e) {
      throw skillError("SKILL_ZIP_INVALID", e?.message || "not a ZIP file");
    }
    entries = entries.filter((e) => !/(^|\/)(__MACOSX|\.DS_Store)(\/|$)/.test(e.name));
    // Where SKILL.md is: the root, or a single top folder.
    const tops = new Set(entries.map((e) => (e.name.includes("/") ? e.name.split("/")[0] : "")));
    const prefix = entries.some((e) => e.name === "SKILL.md") ? "" : tops.size === 1 && !tops.has("") && entries.some((e) => e.name === `${[...tops][0]}/SKILL.md`) ? `${[...tops][0]}/` : null;
    if (prefix === null) throw skillError("SKILL_NO_SKILL_MD", "the ZIP has no SKILL.md at its root or in one top folder");
    const skillMd = entries.find((e) => e.name === `${prefix}SKILL.md`);
    const declared = /^---\r?\n[\s\S]*?^name:\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(new TextDecoder().decode(skillMd.bytes))?.[1];
    const candidates = [declared, prefix.slice(0, -1), fileName.replace(/\.zip$/i, "")].map((v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, "-"));
    const name = candidates.find((v) => SKILL_NAME.test(v));
    if (!name) throw skillError("SKILL_BAD_NAME", "the skill needs a name with letters, digits, - or _");
    const target = join(skillsDir, name);
    if (existsSync(target) && !replace) return { exists: name };
    // Unpack into a temporary folder next to the skills, then move it into place.
    await mkdir(skillsDir, { recursive: true });
    const temp = await mkdtemp(join(skillsDir, `.${name}-`));
    try {
      for (const entry of entries) {
        if (!entry.name.startsWith(prefix)) continue;
        const rel = entry.name.slice(prefix.length);
        const path = resolve(temp, rel);
        const inside = relative(temp, path);
        if (!rel || inside.startsWith("..") || inside.split(sep).includes("..") || resolve(path) === resolve(temp)) throw skillError("SKILL_ZIP_INVALID", `unsafe path in the ZIP: ${entry.name}`);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, entry.bytes);
      }
      if (existsSync(target)) await rm(target, { recursive: true, force: true });
      await rename(temp, target);
    } catch (e) {
      await rm(temp, { recursive: true, force: true });
      throw e;
    }
    return { installed: name };
  }

  return {
    /** Where things are, for the settings screens. */
    "host.info": async () => {
      const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
      // Installation help for missing CLIs: the official guide and the command for this system. Nothing is run.
      const providers = PROVIDER_CATALOG.map((p) => ({ ...p, command: installationCommand(p.id, platform) }));
      return { appId, platform, dataDir, sharedRegistry, skillsDir, providers, ...(mcpExample ? { mcpExample } : {}) };
    },
    "settings.read": read,
    "settings.write": (params) => write(params?.settings),
    /** Validates the MCP JSON as the user types; every problem has a stable code. */
    "mcp.parse": async (params) => parseMcpConfig(String(params?.text ?? "")),
    /**
     * Connects to each valid server once, lists its tools and disconnects. Problems in the
     * JSON are returned as well, so the screen can show both.
     */
    "mcp.test": async (params) => {
      const { servers, problems } = parseMcpConfig(String(params?.text ?? ""));
      const { servers: connected, statuses } = await ExternalServers.connect(servers, quiet);
      const tools = Object.fromEntries(connected.list().map((s) => [s.name, s.tools.map((t) => ({ name: t.name, description: t.description }))]));
      await connected.close();
      return { problems, statuses: statuses.map((s) => ({ ...s, toolNames: tools[s.server] ?? [] })) };
    },
    /**
     * The folder the agent works in for a document: the folder of its file once saved (the file itself changes only
     * through the app's tools, so it is protected), or a private folder of the app before that.
     */
    "workspace.prepare": async (params) => {
      const documentPath = typeof params?.documentPath === "string" && isAbsolute(params.documentPath) ? params.documentPath : null;
      let result;
      if (documentPath) result = { dir: dirname(documentPath), protect: [basename(documentPath)], saved: true };
      else {
        const key = createHash("sha256").update(String(params?.documentId ?? "")).digest("hex").slice(0, 24);
        const dir = join(workspacesDir, key);
        await mkdir(dir, { recursive: true });
        result = { dir, protect: [], saved: false };
      }
      folders.set(String(params?.documentId ?? ""), result.dir);
      return result;
    },
    /**
     * A file the agent made or the person attached, for the app to put into the document (an image, for example):
     * only from the document's folder or the attachments of this app's sessions. { name, mimeType, data (base64) }.
     */
    "workspace.readFile": async (params) => {
      const folder = folders.get(String(params?.documentId ?? ""));
      const raw = String(params?.path ?? "");
      if (!raw) throw fileError("a path is needed");
      const path = await realpath(isAbsolute(raw) ? raw : join(folder ?? "/nonexistent", raw)).catch(() => null);
      if (!path) throw fileError(`there is no file ${raw}`);
      const roots = await Promise.all([folder, join(dataDir, "ai", "sessions", appId)].filter(Boolean).map((r) => realpath(r).catch(() => r)));
      if (!roots.some((root) => { const rel = relative(root, path); return rel && !rel.startsWith("..") && !isAbsolute(rel); })) throw fileError("only files in the document's folder or attached files can be used");
      const info = await stat(path);
      if (!info.isFile()) throw fileError(`${raw} is not a file`);
      if (info.size > MAX_FILE) throw fileError(`${raw} is too large (50 MB at most)`);
      return { name: basename(path), mimeType: mimeOf(path), data: (await readFile(path)).toString("base64") };
    },
    /** A file from the web (http or https), for the app to put into the document. { name, mimeType, data (base64) }. */
    "workspace.fetchUrl": async (params) => {
      const url = String(params?.url ?? "");
      if (!/^https?:\/\/\S+$/.test(url)) throw fileError("only http and https addresses can be used");
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
      if (!response.ok) throw fileError(`the address answered ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_FILE) throw fileError("the file is too large (50 MB at most)");
      const name = decodeURIComponent(new URL(response.url || url).pathname.split("/").pop() || "file");
      return { name, mimeType: (response.headers.get("content-type") || mimeOf(name)).split(";")[0].trim(), data: bytes.toString("base64") };
    },
    "skills.read": async () => ({ dir: skillsDir, exists: existsSync(skillsDir), skills: listSkills(skillsDir) }),
    /**
     * Adds a skill from a ZIP file: SKILL.md at the root of the ZIP or inside one top folder. The folder takes the
     * skill's name (front matter `name`, else the top folder, else the file name). An existing skill with that name is
     * replaced only with `replace: true`; otherwise the answer is { exists: name }. Success: { installed: name }.
     */
    // Problems come back as { error: code, message } so the screen can say what is wrong with the file.
    "skills.install": async (params) => {
      try {
        return await installSkill(String(params?.fileName ?? ""), String(params?.data ?? ""), params?.replace === true);
      } catch (e) {
        if (!String(e?.code ?? "").startsWith("SKILL_")) throw e;
        return { error: e.code, message: e.message };
      }
    },
    /** Deletes one listed skill's folder. */
    "skills.remove": async (params) => {
      const found = listSkills(skillsDir).find((s) => s.folder === params?.folder);
      if (!found) throw skillError("INVALID_ARGUMENT", "there is no such skill");
      await rm(join(skillsDir, found.folder), { recursive: true, force: true });
      return null;
    },
  };
}

function pick(raw) {
  const out = {};
  if (typeof raw.instructions === "string") out.instructions = raw.instructions.slice(0, LIMITS.instructions);
  if (typeof raw.mcp === "string") out.mcp = raw.mcp.slice(0, LIMITS.mcp);
  if (raw.defaultAccountId === null || typeof raw.defaultAccountId === "string") out.defaultAccountId = raw.defaultAccountId;
  if (raw.choices && typeof raw.choices === "object" && !Array.isArray(raw.choices)) {
    out.choices = {};
    for (const [accountId, choice] of Object.entries(raw.choices).slice(0, 50)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountId) || typeof choice?.model !== "string") continue;
      out.choices[accountId] = { model: choice.model.slice(0, 200), effort: typeof choice.effort === "string" ? choice.effort.slice(0, 50) : "" };
    }
  }
  if (raw.mode === "ask" || raw.mode === "auto") out.mode = raw.mode;
  if (typeof raw.web === "boolean") out.web = raw.web;
  return out;
}
