// The Common demo app's main process: the shared host (desktop/host.mjs) with the demo's own settings. Each Edukors
// app has a main script like this one. Run with npm run desktop (or electron . [--shared | --data-dir <dir>]).
import { fileURLToPath } from "node:url";
import { startDesktopApp } from "./host.mjs";

startDesktopApp({
  appId: "common",
  name: "Edukors Common",
  root: fileURLToPath(new URL("..", import.meta.url)),
  page: "demo/index.html",
  skills: "demo/skills",
  documentExtensions: [".ecmx"],
  importExtensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".md", ".markdown", ".txt"],
  exportFormats: ["html", "pdf", "png"],
});
