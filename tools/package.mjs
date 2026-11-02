// Builds this system's installer (electron-builder.yml) into release/. Extra arguments go to electron-builder
// (for example --dir for an unpacked app, or -c.mac.identity=null for an unsigned macOS build).
// The app is assembled in a temporary folder: Dropbox adds extended attributes that break code signing.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const platform = { darwin: "--mac", win32: "--win", linux: "--linux" }[process.platform];
const release = resolve("release"), out = await mkdtemp(join(tmpdir(), "edukors-common-package-"));
try {
  execFileSync(process.execPath, [require.resolve("electron-builder/cli.js"), platform, "--publish", "never", `-c.directories.output=${out}`, ...process.argv.slice(2)], { stdio: "inherit" });
  await mkdir(release, { recursive: true });
  for (const entry of await readdir(out, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.endsWith(".yml") && !entry.name.endsWith(".blockmap")) await copyFile(join(out, entry.name), join(release, entry.name));
    // The unpacked app is copied only when asked for (--dir): it is large, and release/ may sit in a synced folder.
    if (process.argv.includes("--dir") && entry.isDirectory() && /unpacked|^mac/.test(entry.name)) await cp(join(out, entry.name), join(release, entry.name), { recursive: true, verbatimSymlinks: true });
  }
  console.log("Installers in", release);
} finally {
  await rm(out, { recursive: true, force: true });
}
