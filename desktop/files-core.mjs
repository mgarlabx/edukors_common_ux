// File operations of the Electron host, without Electron: the main process adds dialogs and rendering around them,
// and `node --test` covers them directly (tests/files-core.test.mjs). Everything that arrives from the page is checked
// here, because the page is not trusted with the file system: names must be plain file names, folders must exist, and
// only the extensions the app declares can be written or read.
import { randomBytes } from "node:crypto";
import { link, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";

export const MAX_DOCUMENT_BYTES = 512 * 2 ** 20;
export const MAX_EXPORT_BYTES = 512 * 2 ** 20;

export class FileError extends Error {
  constructor(code, message) { super(message); this.name = "FileError"; this.code = code; }
}
const fail = (code, message) => { throw new FileError(code, message); };

// Names the three systems accept: no separators or control characters, no reserved device names, no trailing dot or space.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
export function fileNameProblem(name) {
  if (typeof name !== "string" || !name.trim()) return "is empty";
  if (name.length > 200) return "is longer than 200 characters";
  if (/[\u0000-\u001f\u007f\\/<>:"|?*]/.test(name)) return "contains a character the system does not allow";
  if (name === "." || name === ".." || /[. ]$/.test(name) || name !== name.trim()) return "cannot end with a dot or a space, or start with a space";
  if (RESERVED.test(name)) return "is a name the system reserves";
  return "";
}

async function folderOf(folder) {
  if (typeof folder !== "string" || !isAbsolute(folder)) fail("FOLDER", "The folder must be a full path.");
  const info = await stat(folder).catch(() => null);
  if (!info?.isDirectory()) fail("FOLDER", "The folder does not exist.");
  return resolve(folder);
}

function targetOf(folder, name, extension, allowed) {
  if (!allowed.includes(extension)) fail("EXTENSION", `Files with the extension "${extension}" cannot be written.`);
  const problem = fileNameProblem(name);
  if (problem) fail("NAME", `The name ${problem}.`);
  return join(folder, `${name}${extension}`);
}

const toBuffer = (bytes) => {
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (typeof bytes === "string") return Buffer.from(bytes, "utf8");
  return fail("DATA", "There is nothing to write.");
};

/**
 * Writes `bytes` as <folder>/<name><extension>. The data goes to a temporary file in the same folder first and is then
 * moved over the target, so an interrupted write never leaves a half-written document. Without `replace`, an existing
 * file is left alone and { exists: true } comes back. Success: { path }.
 */
export async function writeFileSafely({ folder, name, extension, bytes, replace = false, allowed }) {
  const dir = await folderOf(folder);
  const target = targetOf(dir, name, extension, allowed);
  const data = toBuffer(bytes);
  if (data.length > MAX_EXPORT_BYTES) fail("SIZE", "The file is too large.");
  const existing = await stat(target).catch(() => null);
  if (existing && !existing.isFile()) fail("NAME", "Something that is not a file already has this name.");
  if (existing && !replace) return { exists: true };
  const temp = join(dir, `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const handle = await open(temp, "wx", 0o644);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    if (existing || replace) await rename(temp, target);
    else {
      // Without replace, never overwrite a file that appeared after the check: a hard link fails if the target exists.
      try { await link(temp, target); await unlink(temp); } catch (error) {
        if (error?.code === "EEXIST") { await unlink(temp).catch(() => {}); return { exists: true }; }
        await rename(temp, target);
      }
    }
  } catch (error) {
    await unlink(temp).catch(() => {});
    if (error instanceof FileError) throw error;
    fail("WRITE", writeMessage(error));
  }
  return { path: target, folder: dir, file: basename(target) };
}

function writeMessage(error) {
  if (error?.code === "EACCES" || error?.code === "EPERM") return "The folder does not allow writing.";
  if (error?.code === "ENOSPC") return "The disk is full.";
  if (error?.code === "EROFS") return "The folder is read-only.";
  return "The file could not be written.";
}

/** Reads a document the person chose: an absolute path to a regular file with an allowed extension. { path, name, folder, bytes }. */
export async function readDocumentFile(path, { allowed, maxBytes = MAX_DOCUMENT_BYTES }) {
  if (typeof path !== "string" || !isAbsolute(path)) fail("PATH", "The file must be given by its full path.");
  const extension = extname(path).toLowerCase();
  if (!allowed.includes(extension)) fail("EXTENSION", `Files with the extension "${extension}" cannot be opened here.`);
  const info = await stat(path).catch(() => null);
  if (!info) fail("MISSING", "The file does not exist.");
  if (!info.isFile()) fail("PATH", "This is not a file.");
  if (info.size > maxBytes) fail("SIZE", "The file is too large.");
  const handle = await open(path, "r").catch((error) => fail("READ", error?.code === "EACCES" ? "The file cannot be read." : "The file could not be opened."));
  try {
    const bytes = await handle.readFile();
    const name = basename(path, extname(path));
    return { path, name, folder: resolve(path, ".."), file: basename(path), bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
  } finally { await handle.close(); }
}

/** A file the page may ask to reveal in the system's file manager: an existing regular file with an absolute path. */
export async function revealablePath(path) {
  if (typeof path !== "string" || !isAbsolute(path)) fail("PATH", "The file must be given by its full path.");
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) fail("MISSING", "The file does not exist.");
  return path;
}

/**
 * The app's list of recent documents, kept by the host (never by the page) in a JSON file of the app's data folder.
 * Entries are added only after a document was really saved or opened, so the page cannot plant paths; opening from the
 * list is allowed only for a path the list holds. Newest first, at most `max` entries; a damaged file reads as empty.
 *   list()        → [{ path, name, folder, file, time, exists }]
 *   add(path)     → after a successful save or open
 *   remove(path), clear(), has(path)
 */
export function createRecentList({ file, allowed, max = 10 }) {
  let entries = null;
  let writing = Promise.resolve();
  const valid = (entry) => entry && typeof entry.path === "string" && isAbsolute(entry.path) && entry.path.length <= 4096
    && allowed.includes(extname(entry.path).toLowerCase()) && Number.isFinite(entry.time);

  async function load() {
    if (entries) return entries;
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      const seen = new Set();
      entries = (Array.isArray(data?.recent) ? data.recent : [])
        .filter((entry) => valid(entry) && !seen.has(entry.path) && seen.add(entry.path))
        .map(({ path, time }) => ({ path, time }))
        .slice(0, max);
    } catch { entries = []; }
    return entries;
  }

  function persist() {
    const data = JSON.stringify({ version: 1, recent: entries }, null, 2);
    writing = writing.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
      try { await writeFile(temp, data, { mode: 0o600 }); await rename(temp, file); }
      catch (error) { await unlink(temp).catch(() => {}); throw error; }
    }).catch(() => {}); // The list is a convenience: a failed write never blocks saving or opening.
    return writing;
  }

  return {
    async list() {
      return Promise.all((await load()).map(async ({ path, time }) => ({
        path, time, name: basename(path, extname(path)), folder: dirname(path), file: basename(path),
        exists: !!(await stat(path).catch(() => null))?.isFile(),
      })));
    },
    async has(path) { return (await load()).some((entry) => entry.path === path); },
    async add(path) {
      if (!valid({ path, time: 0 })) return;
      await load();
      entries = [{ path, time: Date.now() }, ...entries.filter((entry) => entry.path !== path)].slice(0, max);
      await persist();
    },
    async remove(path) { await load(); entries = entries.filter((entry) => entry.path !== path); await persist(); },
    async clear() { entries = []; await persist(); },
  };
}
