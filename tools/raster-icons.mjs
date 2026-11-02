// Renders build/icon.svg into the PNGs the installers need: build/icon.png (1024 px; electron-builder makes the macOS
// and Windows icons from it) and the MSIX tiles in build/appx/. Run after changing the SVG:
//   npx electron tools/raster-icons.mjs
import { app, BrowserWindow } from "electron";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const svg = await readFile(`${ROOT}build/icon.svg`, "utf8");
// [file, width, height]: wide tiles put the square icon in the middle on a transparent background.
const OUT = [["icon.png", 1024, 1024]];
for (const scale of [100, 200]) {
  const k = scale / 100;
  OUT.push([`appx/Square44x44Logo.scale-${scale}.png`, 44 * k, 44 * k], [`appx/Square150x150Logo.scale-${scale}.png`, 150 * k, 150 * k],
    [`appx/Wide310x150Logo.scale-${scale}.png`, 310 * k, 150 * k], [`appx/StoreLogo.scale-${scale}.png`, 50 * k, 50 * k]);
}
app.disableHardwareAcceleration();
// Each size closes its window; without this, closing the first one would quit the app.
app.on("window-all-closed", () => {});
// Not a top-level await: in an ESM main script, "ready" fires only after the module has finished loading.
app.whenReady().then(async () => {
const dir = await mkdtemp(join(tmpdir(), "edukors-icons-"));
for (const [file, width, height] of OUT) {
  const window = new BrowserWindow({ show: false, width, height, useContentSize: true, transparent: true, frame: false });
  const side = Math.min(width, height);
  const html = `<html><body style="margin:0;background:transparent;display:grid;place-items:center;width:${width}px;height:${height}px;overflow:hidden">${svg.replace("<svg ", `<svg width="${side}" height="${side}" `)}</body></html>`;
  const page = join(dir, "icon.html");
  await writeFile(page, html);
  await window.loadFile(page);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
  await writeFile(`${ROOT}build/${file}`, image.resize({ width, height }).toPNG());
  window.destroy();
  console.log(file, width, height);
}
await rm(dir, { recursive: true, force: true });
app.quit();
});
