import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileError, createRecentList, fileExists, fileNameProblem, readDocumentFile, revealablePath, writeFileSafely } from "../desktop/files-core.mjs";

const allowed = [".ecmx"];
const dir = async () => mkdtemp(join(tmpdir(), "edukors-files-"));

test("file names: plain names pass, unsafe ones do not", () => {
  for (const ok of ["Lesson 1", "ação", "a.b", "x".repeat(200)]) assert.equal(fileNameProblem(ok), "", ok);
  for (const bad of ["", " ", "a/b", "a\\b", "..", ".", "con", "NUL.txt", "a:", "a*", "end.", "end ", " lead", "x".repeat(201), "tab\there"]) assert.notEqual(fileNameProblem(bad), "", JSON.stringify(bad));
});

test("writeFileSafely writes, refuses to overwrite without replace, and leaves no temporary file", async () => {
  const folder = await dir();
  try {
    assert.equal(await fileExists({ folder, name: "doc", extension: ".ecmx", allowed }), false);
    const first = await writeFileSafely({ folder, name: "doc", extension: ".ecmx", bytes: new Uint8Array([1, 2, 3]), allowed });
    assert.equal(first.path, join(folder, "doc.ecmx"));
    assert.equal(await fileExists({ folder, name: "doc", extension: ".ecmx", allowed }), true);
    assert.deepEqual([...await readFile(first.path)], [1, 2, 3]);
    assert.deepEqual(await writeFileSafely({ folder, name: "doc", extension: ".ecmx", bytes: new Uint8Array([9]), allowed }), { exists: true });
    assert.deepEqual([...await readFile(first.path)], [1, 2, 3]);
    await writeFileSafely({ folder, name: "doc", extension: ".ecmx", bytes: new Uint8Array([9]), replace: true, allowed });
    assert.deepEqual([...await readFile(first.path)], [9]);
    assert.deepEqual(await readdir(folder), ["doc.ecmx"]);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("writeFileSafely refuses bad names, extensions, folders, and data", async () => {
  const folder = await dir();
  try {
    const code = async (args) => { try { await writeFileSafely({ allowed, bytes: new Uint8Array(1), ...args }); } catch (e) { assert.ok(e instanceof FileError); return e.code; } return "none"; };
    assert.equal(await code({ folder, name: "../x", extension: ".ecmx" }), "NAME");
    assert.equal(await code({ folder, name: "x", extension: ".exe" }), "EXTENSION");
    assert.equal(await code({ folder: "relative", name: "x", extension: ".ecmx" }), "FOLDER");
    assert.equal(await code({ folder: join(folder, "nope"), name: "x", extension: ".ecmx" }), "FOLDER");
    assert.equal(await code({ folder, name: "x", extension: ".ecmx", bytes: 42 }), "DATA");
    await mkdir(join(folder, "dir.ecmx"));
    assert.equal(await code({ folder, name: "dir", extension: ".ecmx", replace: true }), "NAME");
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("readDocumentFile reads allowed files only", async () => {
  const folder = await dir();
  try {
    const file = join(folder, "a.ecmx");
    await writeFile(file, new Uint8Array([5, 6]));
    const read = await readDocumentFile(file, { allowed });
    assert.deepEqual([read.name, read.folder, read.file, [...read.bytes]], ["a", folder, "a.ecmx", [5, 6]]);
    const code = async (path) => { try { await readDocumentFile(path, { allowed }); } catch (e) { return e.code; } return "none"; };
    assert.equal(await code("a.ecmx"), "PATH");
    assert.equal(await code(join(folder, "missing.ecmx")), "MISSING");
    await writeFile(join(folder, "a.txt"), "x");
    assert.equal(await code(join(folder, "a.txt")), "EXTENSION");
    await mkdir(join(folder, "d.ecmx"));
    assert.equal(await code(join(folder, "d.ecmx")), "PATH");
    const big = join(folder, "big.ecmx");
    await writeFile(big, new Uint8Array(11));
    await assert.rejects(readDocumentFile(big, { allowed, maxBytes: 10 }), (e) => e.code === "SIZE");
    assert.equal((await readDocumentFile(big, { allowed, maxBytes: 11 })).bytes.length, 11);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("revealablePath accepts only existing absolute files", async () => {
  const folder = await dir();
  try {
    const file = join(folder, "r.txt");
    await writeFile(file, "x");
    assert.equal(await revealablePath(file), file);
    await assert.rejects(revealablePath(folder), { code: "MISSING" });
    await assert.rejects(revealablePath("r.txt"), { code: "PATH" });
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("recent list: newest first, no duplicates, limited, persisted, and missing files dropped", async () => {
  const folder = await dir();
  try {
    const store = join(folder, "data", "recent.json");
    const recent = createRecentList({ file: store, allowed, max: 3 });
    assert.deepEqual(await recent.list(), []);
    const paths = ["a", "b", "c", "d"].map((n) => join(folder, `${n}.ecmx`));
    for (const p of paths.slice(0, 3)) await writeFile(p, "x");
    for (const p of paths) await recent.add(p);
    await recent.add(paths[1]);
    await recent.add("relative.ecmx");
    await recent.add(join(folder, "e.txt"));
    let list = await recent.list();
    // d.ecmx was never written: it is dropped from the list (and from the stored file) instead of being shown.
    assert.deepEqual(list.map((e) => e.file), ["b.ecmx", "c.ecmx"]);
    assert.deepEqual([list[0].name, list[0].folder], ["b", folder]);
    assert.equal(await recent.has(paths[0]), false);
    assert.equal(await recent.has(paths[3]), false);
    assert.equal(await recent.has(paths[2]), true);

    const again = createRecentList({ file: store, allowed, max: 3 });
    assert.deepEqual((await again.list()).map((e) => e.file), ["b.ecmx", "c.ecmx"]);
    await rm(paths[2]);
    assert.deepEqual((await again.list()).map((e) => e.file), ["b.ecmx"]);
    await again.remove(paths[1]);
    assert.deepEqual((await again.list()).map((e) => e.file), []);
    await again.clear();
    assert.deepEqual(await createRecentList({ file: store, allowed }).list(), []);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("recent list: a damaged or hostile file reads as empty or filtered", async () => {
  const folder = await dir();
  try {
    const store = join(folder, "recent.json");
    await writeFile(store, "{not json");
    assert.deepEqual(await createRecentList({ file: store, allowed }).list(), []);
    await writeFile(join(folder, "ok.ecmx"), "x");
    await writeFile(store, JSON.stringify({ recent: [{ path: "/etc/passwd", time: 1 }, { path: "rel.ecmx", time: 1 }, { path: join(folder, "ok.ecmx"), time: 1 }, { path: join(folder, "ok.ecmx"), time: 2 }, { path: join(folder, "t.ecmx") }] }));
    assert.deepEqual((await createRecentList({ file: store, allowed }).list()).map((e) => e.file), ["ok.ecmx"]);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
