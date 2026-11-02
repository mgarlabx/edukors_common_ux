// Preload script (sandboxed, so CommonJS): the only bridge between the page and the main process.
// The page sees `EdukorsDesktop.ai = { send(message), onMessage(fn) }` and nothing else; src/ai/ui/ai-host.js picks it
// as the transport. No Node or Electron object reaches the page.
const { contextBridge, ipcRenderer } = require("electron");

let listener = null;
ipcRenderer.on("edukors:ai:message", (_event, message) => listener?.(message));

// Files the system opens (double-click, Open With): the host sends each one as { file, name } or { error, code, name }.
let openedListener = null;
ipcRenderer.on("edukors:files:opened", (_event, result) => openedListener?.(result));

// Files: the page asks, the main process checks and does the work (see desktop/files-core.mjs). Every call answers
// with a plain object; problems come back as { error: "message" }, never as an exception with internal details.
const files = {
  info: () => ipcRenderer.invoke("edukors:files:info"),
  chooseFolder: (options) => ipcRenderer.invoke("edukors:files:choose-folder", options),
  save: (request) => ipcRenderer.invoke("edukors:files:save", request),
  open: (request) => ipcRenderer.invoke("edukors:files:open", request),
  // Import: { title, allLabel, formats: [{ name, extensions }] } → { file: { name, file, extension, bytes } } | { canceled }.
  import: (request) => ipcRenderer.invoke("edukors:files:import", request),
  // Recent documents, kept by the host: list, open one of them, forget one (`path`) or all (no path).
  recent: () => ipcRenderer.invoke("edukors:files:recent"),
  openRecent: (request) => ipcRenderer.invoke("edukors:files:open-recent", request),
  forgetRecent: (request) => ipcRenderer.invoke("edukors:files:forget-recent", request ?? {}),
  export: (request) => ipcRenderer.invoke("edukors:files:export", request),
  reveal: (request) => ipcRenderer.invoke("edukors:files:reveal", request),
  // Tells the window whether unsaved changes exist, so closing it can ask first. `labels`: { message, discard, cancel }.
  setDirty: (dirty, labels) => ipcRenderer.send("edukors:files:dirty", { dirty: dirty === true, labels }),
  // Registering the listener tells the host the page can take files the system opens; those waiting arrive then.
  onOpened: (fn) => {
    openedListener = typeof fn === "function" ? fn : null;
    if (openedListener) ipcRenderer.send("edukors:files:opened-listen");
  },
};

// Application menu (macOS): the page gives the labels in the interface language and runs the commands it receives.
let menuListener = null;
ipcRenderer.on("edukors:menu:command", (_event, command) => menuListener?.(command));
const menu = {
  setLabels: (labels) => ipcRenderer.send("edukors:menu:labels", labels),
  onCommand: (fn) => { menuListener = typeof fn === "function" ? fn : null; },
};

// Window: the page's title bar stands in for the system's (see desktop/main.mjs, "Title bar").
let stateListener = null;
ipcRenderer.on("edukors:window:state", (_event, state) => stateListener?.(state));
const windowBridge = {
  platform: process.platform, // "darwin", "win32", "linux": where to leave room for the system's buttons
  setTitleBar: (bar) => ipcRenderer.send("edukors:window:title-bar", bar), // { height, color, symbolColor }
  onState: (fn) => { stateListener = typeof fn === "function" ? fn : null; }, // { fullScreen }
};

// The app: terms of use (accepted version, accept, quit) and update notices.
let updateListener = null;
ipcRenderer.on("edukors:app:update", (_event, update) => updateListener?.(update));
const appBridge = {
  terms: () => ipcRenderer.invoke("edukors:app:terms"), // { accepted: version | null }
  acceptTerms: (version) => ipcRenderer.invoke("edukors:app:accept-terms", { version }),
  quit: () => ipcRenderer.send("edukors:app:quit"),
  onUpdate: (fn) => { updateListener = typeof fn === "function" ? fn : null; }, // { version, url }
};

contextBridge.exposeInMainWorld("EdukorsDesktop", {
  files,
  app: appBridge,
  window: windowBridge,
  menu,
  ai: {
    send: (message) => ipcRenderer.send("edukors:ai:send", message),
    // Registering the listener is what starts the session: the main process creates this window's dispatcher (which
    // announces { ready }) only after the page can hear it.
    onMessage: (fn) => {
      listener = typeof fn === "function" ? fn : null;
      ipcRenderer.send("edukors:ai:attach");
    },
  },
});
