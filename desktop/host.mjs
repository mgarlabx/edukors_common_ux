// Electron host shared by every Edukors app (main process). An app's main script calls startDesktopApp with what is its
// own; everything else is the same in every app: the AI dispatcher (the same as the development host's,
// tools/dev-host.mjs, carried over IPC), files (save, open, Recent, import, export, Show in folder), the macOS menu, the
// integrated title bar, terms of use, and update checks. The page reaches it only through desktop/preload.cjs; shared
// UI code never calls Electron directly.
//
//   import { startDesktopApp } from "edukors-common-ux/desktop/host.mjs";
//   startDesktopApp({ appId: "text", name: "Edukors Text Editor", root: <the app's folder>, documentExtensions: [".etex"] });
//
// Run with: electron . [--shared | --data-dir <dir>] [--verbose]
//   Unpackaged (development): accounts in a development registry next to the shared one ("EDUKORS-dev") with the fake
//   provider, as in the development host; --shared uses the real shared accounts; --data-dir uses another folder
//   (automated tests: an empty one, never the person's accounts).
//   Packaged: the shared registry, and this app's settings, skills, and workspaces under the user data folder.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, session, shell } from "electron";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createAiCli } from "../src/ai/runtime/engine.js";
import { bundledProviders } from "../src/ai/runtime/providers.js";
import { defaultDataDir } from "../src/ai/runtime/platform/paths.js";
import { createHostDispatcher } from "../src/ai/runtime/host/dispatcher.js";
import { createAppMethods } from "../src/ai/host/app-methods.js";
import { startUpdateChecks, updatesOf } from "./updates.mjs";
import { FileError, createRecentList, readDocumentFile, revealablePath, writeFileSafely } from "./files-core.mjs";


// Common's own folder (the preload script lives here, also when Common sits in an app's node_modules).
const COMMON = fileURLToPath(new URL("..", import.meta.url));

/**
 * Starts the app. options: appId (lowercase, used for data folders), name (shown in the window and menu), root (the
 * app's folder: its package.json and page), page ("index.html"), skills (unpackaged sample skills folder, "skills"),
 * documentExtensions ([".etex"]), importExtensions ([] : nothing to import), exportFormats (["html", "pdf", "png"]).
 */
export function startDesktopApp(options) {
  const {
    appId, name, root, page = "index.html", skills = "skills", documentExtensions,
    importExtensions = [], exportFormats = ["html", "pdf", "png"], openExtensions = [], saveExtensions = [],
  } = options;
  if (!/^[a-z][a-z0-9-]*$/.test(appId ?? "") || !name || !root || !documentExtensions?.length) throw new Error("startDesktopApp needs appId, name, root, and documentExtensions.");
  const ROOT = root;
  const APP_ID = appId;
  const { values } = parseArgs({
    args: process.argv.slice(app.isPackaged ? 1 : 2),
    options: { shared: { type: "boolean", default: false }, "data-dir": { type: "string" }, verbose: { type: "boolean", default: false } },
    strict: false,
  });
  const CUSTOM_DIR = typeof values["data-dir"] === "string" ? resolve(values["data-dir"]) : null;
  const SHARED = app.isPackaged || (values.shared === true && !CUSTOM_DIR);
  const SHARED_DIR = defaultDataDir();
  const DEV_DIR = join(dirname(SHARED_DIR), `${basename(SHARED_DIR)}-dev`);
  const DATA_DIR = CUSTOM_DIR ?? (SHARED ? SHARED_DIR : DEV_DIR);
  // This app's own files (AI settings may hold keys): never inside the repository.
  const APP_DIR = app.isPackaged ? join(app.getPath("userData")) : join(CUSTOM_DIR ?? DEV_DIR, "apps", APP_ID);
  // Skills: unpackaged, the app's own folder of sample skills (`skills`, relative to root); packaged, the user data folder.
  const SKILLS_DIR = app.isPackaged ? join(APP_DIR, "skills") : join(ROOT, skills);
  const PAGE = pathToFileURL(join(ROOT, page)).href;

  const log = (level, message) => {
    if (values.verbose || level === "warn" || level === "error") process.stderr.write(`[${level}] ${message}\n`);
  };

  // One dispatcher per window; the page attaches after it can receive messages.
  const sessions = new Map(); // webContents id → dispatcher

  function attach(contents) {
    const previous = sessions.get(contents.id);
    if (previous) void previous.close();
    const ai = createAiCli({
      appId: APP_ID,
      providers: bundledProviders({ fake: !SHARED }),
      dataDir: DATA_DIR,
      logSink: (entry) => log(entry.level, `${entry.scope}: ${entry.message}`),
    });
    const methods = createAppMethods({
      appId: APP_ID, dataDir: DATA_DIR, sharedRegistry: SHARED, settingsFile: join(APP_DIR, "ai-settings.json"),
      skillsDir: SKILLS_DIR, workspacesDir: join(APP_DIR, "workspaces"), log: ai.diagnostics.scoped("app"),
    });
    const send = (message) => { if (!contents.isDestroyed()) contents.send("edukors:ai:message", message); };
    const dispatcher = createHostDispatcher({ ai, send, methods });
    sessions.set(contents.id, dispatcher);
    contents.once("destroyed", () => { if (sessions.get(contents.id) === dispatcher) sessions.delete(contents.id); void dispatcher.close(); });
  }

  // Only the app's own page (the main frame) may talk to the AI host.
  const trusted = (event) => event.senderFrame === event.sender.mainFrame && event.senderFrame.url.split("#")[0] === PAGE;

  ipcMain.on("edukors:ai:attach", (event) => { if (trusted(event)) attach(event.sender); });
  ipcMain.on("edukors:ai:send", (event, message) => { if (trusted(event)) sessions.get(event.sender.id)?.receive(message); });

  // ---------- Files ----------
  // What this app writes and opens. The page may ask for more; the host refuses anything outside these lists.
  const DOCUMENT_EXTENSIONS = documentExtensions.map((e) => e.toLowerCase());
  // Files of other formats that Open and Recent also accept: the page converts them into a document that has no file
  // of its own yet (Save asks for a name and saves in the app's format; the original is never written).
  const OPEN_EXTENSIONS = [...DOCUMENT_EXTENSIONS, ...openExtensions.map((e) => e.toLowerCase()).filter((e) => !DOCUMENT_EXTENSIONS.includes(e))];
  const MAX_OPEN_BYTES = 50 * 2 ** 20;
  // Of those, the formats a document opened from such a file can be saved back in (only into that very file).
  const SAVE_EXTENSIONS = saveExtensions.map((e) => e.toLowerCase()).filter((e) => OPEN_EXTENSIONS.includes(e) && !DOCUMENT_EXTENSIONS.includes(e));
  // PDF and PNG are rendered here from the page's HTML; the other formats come from the page ready to write.
  const RENDERED = new Set(["pdf", "png"]);
  const EXPORT_EXTENSIONS = Object.fromEntries(Object.entries({ html: ".html", pdf: ".pdf", png: ".png", md: ".md", txt: ".txt", docx: ".docx" }).filter(([format]) => exportFormats.includes(format)));
  // Files other formats can be imported from (the page converts them into a new, unsaved document). The page's list
  // of formats only narrows this one.
  const IMPORT_EXTENSIONS = importExtensions.map((e) => e.toLowerCase());
  const MAX_IMPORT_BYTES = 50 * 2 ** 20;
  // Recent documents: kept here, in the app's data folder, and updated only after a real save or open.
  const recent = createRecentList({ file: join(APP_DIR, "recent.json"), allowed: OPEN_EXTENSIONS });
  // A document of this app, or a file of another format Open accepts (at most 50 MB, like an import).
  const readOpenable = (path) => readDocumentFile(path, { allowed: OPEN_EXTENSIONS, maxBytes: DOCUMENT_EXTENSIONS.includes(extname(path).toLowerCase()) ? undefined : MAX_OPEN_BYTES });

  // Problems the person can act on come back as { error: message }; anything unexpected is logged and reported plainly.
  const answer = async (work) => {
    try { return await work(); } catch (error) {
      if (error instanceof FileError) return { error: error.message, code: error.code };
      log("error", `files: ${error?.stack ?? error}`);
      return { error: "Something went wrong.", code: "INTERNAL" };
    }
  };
  const text = (value, max = 200) => (typeof value === "string" ? value.slice(0, max) : undefined);
  const windowOf = (event) => BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const handle = (channel, fn) => ipcMain.handle(channel, (event, request) => (trusted(event) ? fn(event, request ?? {}) : { error: "Not allowed.", code: "UNTRUSTED" }));

  handle("edukors:files:info", () => ({ documents: app.getPath("documents"), home: homedir(), platform: process.platform }));

  handle("edukors:files:choose-folder", async (event, { defaultPath, title }) => {
    const result = await dialog.showOpenDialog(windowOf(event), { title: text(title), defaultPath: text(defaultPath, 1000), properties: ["openDirectory", "createDirectory"] });
    return result.canceled || !result.filePaths[0] ? { canceled: true } : { folder: result.filePaths[0] };
  });

  handle("edukors:files:save", (event, { folder, name, extension, bytes, replace }) => answer(async () => {
    const lower = String(extension).toLowerCase();
    let allowed = DOCUMENT_EXTENSIONS;
    // Another format: only into a file that was opened (it is in Recent), replacing it.
    if (!DOCUMENT_EXTENSIONS.includes(lower)) {
      if (!SAVE_EXTENSIONS.includes(lower)) throw new FileError("EXTENSION", `Files with the extension "${extension}" cannot be saved.`);
      if (typeof folder !== "string" || typeof name !== "string" || !(await recent.has(join(folder, `${name}${extension}`)))) throw new FileError("ORIGINAL", "Only a file that was opened can be saved in its own format.");
      allowed = [extension];
    }
    const result = await writeFileSafely({ folder, name, extension, bytes, replace: replace === true, allowed });
    if (result.path) await recent.add(result.path);
    return result;
  }));

  // Open always goes through the system's dialog; the page cannot name a path here (Recent has its own request).
  handle("edukors:files:open", (event, { title, filterName, allLabel }) => answer(async () => {
    const result = await dialog.showOpenDialog(windowOf(event), {
      title: text(title), defaultPath: app.getPath("documents"), properties: ["openFile"],
      filters: [
        ...(OPEN_EXTENSIONS.length > DOCUMENT_EXTENSIONS.length ? [{ name: text(allLabel, 80) || "All supported files", extensions: OPEN_EXTENSIONS.map((e) => e.slice(1)) }] : []),
        { name: text(filterName, 80) || "Documents", extensions: DOCUMENT_EXTENSIONS.map((e) => e.slice(1)) },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const file = await readOpenable(result.filePaths[0]);
    await recent.add(file.path);
    return { file };
  }));

  // Import: the system's dialog, filtered to the formats the page offers among those the host accepts. The file is only
  // read; the page never learns its folder, and it does not enter Recent (the new document has no file yet).
  handle("edukors:files:import", (event, { title, formats, allLabel }) => answer(async () => {
    const filters = (Array.isArray(formats) ? formats.slice(0, 20) : []).map((format) => ({
      name: text(format?.name, 80) || "Files",
      extensions: (Array.isArray(format?.extensions) ? format.extensions : []).filter((e) => IMPORT_EXTENSIONS.includes(e)).map((e) => e.slice(1)),
    })).filter((filter) => filter.extensions.length);
    if (!filters.length) throw new FileError("FORMAT", "There is no format to import.");
    if (filters.length > 1) filters.unshift({ name: text(allLabel, 80) || "All supported files", extensions: [...new Set(filters.flatMap((f) => f.extensions))] });
    const result = await dialog.showOpenDialog(windowOf(event), { title: text(title), defaultPath: app.getPath("documents"), properties: ["openFile"], filters });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const chosen = result.filePaths[0], extension = extname(chosen).toLowerCase();
    if (!filters.some((f) => f.extensions.includes(extension.slice(1)))) throw new FileError("EXTENSION", `Files with the extension "${extension}" cannot be imported.`);
    const file = await readDocumentFile(chosen, { allowed: IMPORT_EXTENSIONS, maxBytes: MAX_IMPORT_BYTES });
    return { file: { name: file.name, file: file.file, extension, bytes: file.bytes } };
  }));

  handle("edukors:files:recent", () => answer(async () => ({ recent: await recent.list() })));
  // Only a path the list holds can be opened this way. A file that is gone leaves the list.
  handle("edukors:files:open-recent", (event, { path }) => answer(async () => {
    if (!(await recent.has(path))) throw new FileError("RECENT", "This document is not in the list of recent documents.");
    try {
      const file = await readOpenable(path);
      await recent.add(file.path);
      return { file };
    } catch (error) {
      if (error instanceof FileError && error.code === "MISSING") await recent.remove(path);
      throw error;
    }
  }));
  handle("edukors:files:forget-recent", (event, { path }) => answer(async () => { if (typeof path === "string") await recent.remove(path); else await recent.clear(); return {}; }));

  handle("edukors:files:reveal", (event, { path }) => answer(async () => { shell.showItemInFolder(await revealablePath(path)); return {}; }));

  // Export: the page renders the document to one HTML page (images inline); a hidden window turns it into PDF or PNG.
  // That window has no preload, runs no scripts, and cannot reach the network.
  let exportSession;
  async function renderExport(format, html, width, height) {
    const dir = await mkdtemp(join(tmpdir(), "edukors-export-"));
    const scale = format === "png" ? 2 : 1;
    const window = new BrowserWindow({
      show: false, width: Math.ceil(width * scale), height: Math.ceil(height * scale), useContentSize: true,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false, partition: "edukors-export", zoomFactor: scale },
    });
    try {
      exportSession ??= session.fromPartition("edukors-export");
      exportSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|data|blob):/i.test(details.url) }));
      const file = join(dir, "page.html");
      await writeFile(file, html, "utf8");
      await window.loadFile(file);
      if (format === "png") return (await window.webContents.capturePage()).toPNG();
      return await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: "none" } });
    } finally {
      window.destroy();
      await rm(dir, { recursive: true, force: true });
    }
  }

  // { html, width, height } for HTML, PDF, and PNG; { data } (text or bytes) for the formats the page makes itself.
  handle("edukors:files:export", (event, { folder, name, format, html, data: given, width, height }) => answer(async () => {
    const extension = EXPORT_EXTENSIONS[format];
    if (!extension) throw new FileError("FORMAT", "This format is not available.");
    let data;
    if (format === "html" || RENDERED.has(format)) {
      if (typeof html !== "string" || html.length > 200 * 2 ** 20) throw new FileError("DATA", "There is nothing to export.");
      const w = Number(width), h = Number(height);
      if (RENDERED.has(format) && !(w >= 50 && w <= 8000 && h >= 50 && h <= 8000)) throw new FileError("DATA", "The page size is not valid.");
      data = format === "html" ? html : await renderExport(format, html, w, h);
    } else {
      if (!(typeof given === "string" || given instanceof Uint8Array)) throw new FileError("DATA", "There is nothing to export.");
      data = given;
    }
    // Exporting again overwrites the previous export, so replace is always on.
    const result = await writeFileSafely({ folder, name, extension, bytes: data, replace: true, allowed: Object.values(EXPORT_EXTENSIONS) });
    return { path: result.path };
  }));

  // Closing the window with unsaved changes asks first (the page reports its state; see EdukorsDesktop.files.setDirty).
  const dirty = new Map(); // webContents id → labels, while there are unsaved changes
  ipcMain.on("edukors:files:dirty", (event, { dirty: isDirty, labels }) => {
    if (!trusted(event)) return;
    if (!isDirty) { dirty.delete(event.sender.id); return; }
    dirty.set(event.sender.id, { message: text(labels?.message, 300) || "Close without saving your changes?", discard: text(labels?.discard, 60) || "Close without saving", cancel: text(labels?.cancel, 60) || "Cancel" });
  });

  // ---------- Menu ----------
  // macOS needs an application menu: without one, Electron shows its own (where Cmd+W closes the whole window), and
  // without an Edit menu, Cmd+C, Cmd+V, and Cmd+A stop working in text fields. The menu is minimal: the app menu, Edit,
  // and Window. Windows and Linux get no menu bar; the toolbar holds the commands and the page handles the shortcuts.
  // The page sends the labels in the interface language (EdukorsDesktop.menu.setLabels) and receives the commands
  // (EdukorsDesktop.menu.onCommand), so the menu and the toolbar run the same code. Keys the page already handled
  // (preventDefault) do not reach the menu, so canvas shortcuts are not run twice.
  const MAC = process.platform === "darwin";
  const MENU_DEFAULTS = {
    name, version: "", about: "About {name}", settings: "Settings…", services: "Services", hide: "Hide {name}",
    hideOthers: "Hide Others", showAll: "Show All", quit: "Quit {name}", edit: "Edit", undo: "Undo", redo: "Redo", cut: "Cut",
    copy: "Copy", paste: "Paste", delete: "Delete", selectAll: "Select All", window: "Window", minimize: "Minimize", zoom: "Zoom",
    closeTab: "Close Tab", front: "Bring All to Front",
  };
  let menuLabels = { ...MENU_DEFAULTS };

  function buildMenu() {
    if (!MAC) { Menu.setApplicationMenu(null); return; }
    const l = menuLabels, named = (label) => label.replaceAll("{name}", l.name);
    const command = (name) => (_item, window) => { const target = window ?? BrowserWindow.getFocusedWindow(); target?.webContents.send("edukors:menu:command", name); };
    app.setAboutPanelOptions({ applicationName: l.name, applicationVersion: l.version, version: "" });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: l.name, submenu: [
        { role: "about", label: named(l.about) },
        { type: "separator" },
        { label: l.settings, accelerator: "Cmd+,", click: command("settings") },
        { type: "separator" },
        { role: "services", label: l.services },
        { type: "separator" },
        { role: "hide", label: named(l.hide) }, { role: "hideOthers", label: l.hideOthers }, { role: "unhide", label: l.showAll },
        { type: "separator" },
        { role: "quit", label: named(l.quit) },
      ] },
      // Undo, Redo, Delete, and Select All go to the page: it decides between a text field (native) and the document.
      { label: l.edit, submenu: [
        { label: l.undo, accelerator: "Cmd+Z", click: command("undo") },
        { label: l.redo, accelerator: "Shift+Cmd+Z", click: command("redo") },
        { type: "separator" },
        { role: "cut", label: l.cut }, { role: "copy", label: l.copy }, { role: "paste", label: l.paste },
        { label: l.delete, click: command("delete") },
        { label: l.selectAll, accelerator: "Cmd+A", click: command("selectAll") },
      ] },
      { label: l.window, role: "windowMenu", submenu: [
        { role: "minimize", label: l.minimize }, { role: "zoom", label: l.zoom },
        { type: "separator" },
        { label: l.closeTab, accelerator: "Cmd+W", click: command("closeTab") },
        { type: "separator" },
        { role: "front", label: l.front },
      ] },
    ]));
  }

  ipcMain.on("edukors:menu:labels", (event, labels) => {
    if (!trusted(event) || !labels || typeof labels !== "object") return;
    const next = { ...MENU_DEFAULTS };
    for (const key of Object.keys(MENU_DEFAULTS)) next[key] = text(labels[key], 80) || MENU_DEFAULTS[key];
    menuLabels = next;
    buildMenu();
  });

  // ---------- Terms of use and updates ----------
  // The page asks for the version of the terms the person accepted and records a new acceptance; declining quits.
  // Kept in this app's data folder (unpackaged: the development or --data-dir folder, so tests start fresh).
  const TERMS_FILE = join(APP_DIR, "terms.json");
  handle("edukors:app:terms", async () => {
    // Automated runs of an unpackaged app (EDUKORS_ACCEPT_TERMS=1) skip the terms; a packaged app always asks.
    if (!app.isPackaged && process.env.EDUKORS_ACCEPT_TERMS) return { accepted: null, skip: true };
    try { const data = JSON.parse(await readFile(TERMS_FILE, "utf8")); return { accepted: typeof data?.accepted === "string" ? data.accepted : null }; }
    catch { return { accepted: null }; }
  });
  handle("edukors:app:accept-terms", (event, { version }) => answer(async () => {
    if (typeof version !== "string" || !version || version.length > 40) throw new FileError("DATA", "Unknown terms version.");
    await mkdir(APP_DIR, { recursive: true });
    await writeFile(TERMS_FILE, JSON.stringify({ accepted: version, at: new Date().toISOString() }, null, 2));
    return {};
  }));
  ipcMain.on("edukors:app:quit", (event) => { if (trusted(event)) app.quit(); });

  // Updates (desktop/updates.mjs): the latest release of the repository the app names in package.json ("edukors":
  // { "updates": "owner/repo" }), told to every window. Common names none, so its own demo never checks.
  function checkForUpdates() {
    if (!app.isPackaged || process.windowsStore || process.env.EDUKORS_NO_UPDATES) return;
    const where = updatesOf(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")));
    if (!where) return;
    startUpdateChecks({
      current: app.getVersion(), ...where, fetch: (url, options) => net.fetch(url, options), log: (message) => log("warn", message),
      notify: (update) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send("edukors:app:update", update); },
    });
  }

  // ---------- Title bar ----------
  // The page's title bar is the window's: the system's own title bar is hidden and its real buttons sit over the page.
  // macOS: the traffic lights, centered vertically in the page's bar. Windows and Linux: minimize, maximize, and close
  // drawn by the system on the right (titleBarOverlay) in the bar's colors. The page reports the bar's height and
  // colors (EdukorsDesktop.window.setTitleBar) whenever the font size or the theme changes, and hears about full screen.
  const TITLE_BAR = { height: 33, color: "#ffffff", symbolColor: "#64718e" };
  const MAC_BUTTONS = { width: 52, height: 14 }; // the traffic lights' block, roughly; x is fixed, y centers it
  const color = (value, fallback) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

  function applyTitleBar(window, { height, color: background, symbolColor }) {
    if (window.isDestroyed()) return;
    const h = Math.round(Math.min(120, Math.max(24, Number(height) || TITLE_BAR.height)));
    if (MAC) window.setWindowButtonPosition({ x: 12, y: Math.round((h - MAC_BUTTONS.height) / 2) });
    else window.setTitleBarOverlay({ height: h, color: color(background, TITLE_BAR.color), symbolColor: color(symbolColor, TITLE_BAR.symbolColor) });
  }

  ipcMain.on("edukors:window:title-bar", (event, bar) => {
    const window = trusted(event) && windowOf(event);
    if (window && bar && typeof bar === "object") applyTitleBar(window, bar);
  });

  function createWindow() {
    const window = new BrowserWindow({
      width: 1360, height: 860, minWidth: 360, minHeight: 400, title: name,
      titleBarStyle: "hidden",
      ...(MAC ? { trafficLightPosition: { x: 12, y: Math.round((TITLE_BAR.height - MAC_BUTTONS.height) / 2) } } : { titleBarOverlay: TITLE_BAR }),
      webPreferences: { preload: join(COMMON, "desktop", "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    });
    // Links leave the app: http, https, and mailto open in the system's browser or mail program; nothing else opens.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    // Unpackaged, the developer tools stay reachable without a menu: Cmd+Option+I (macOS), Ctrl+Shift+I, or F12.
    if (!app.isPackaged) window.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toLowerCase();
      if (input.type === "keyDown" && (input.key === "F12" || (key === "i" && (MAC ? input.meta && input.alt : input.control && input.shift)))) {
        event.preventDefault();
        window.webContents.toggleDevTools();
      }
    });
    window.webContents.on("will-navigate", (event, url) => { if (url.split("#")[0] !== PAGE) event.preventDefault(); });
    window.on("close", (event) => {
      const labels = dirty.get(window.webContents.id);
      if (!labels || window.isDestroyed()) return;
      const choice = dialog.showMessageBoxSync(window, { type: "warning", buttons: [labels.cancel, labels.discard], defaultId: 0, cancelId: 0, message: labels.message });
      if (choice === 0) event.preventDefault();
    });
    // In full screen macOS hides the traffic lights, so the page gives their room back.
    const fullScreen = (value) => () => { if (!window.isDestroyed()) window.webContents.send("edukors:window:state", { fullScreen: value }); };
    window.on("enter-full-screen", fullScreen(true));
    window.on("leave-full-screen", fullScreen(false));
    void window.loadURL(PAGE);
    return window;
  }

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    checkForUpdates();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  // Quitting first closes the windows, which may ask about unsaved changes and cancel; AI sessions end only on a real quit.
  app.on("will-quit", () => { for (const dispatcher of sessions.values()) void dispatcher.close(); });
}
