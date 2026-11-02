import { mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { AiCliError } from "../errors.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function processAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        return e.code === "EPERM";
    }
}
async function isStale(dir, staleMs) {
    try {
        const info = await stat(dir);
        if (Date.now() - info.mtimeMs > staleMs)
            return true;
        const owner = JSON.parse(await readFile(join(dir, "owner.json"), "utf8"));
        return owner.host === hostname() && typeof owner.pid === "number" && !processAlive(owner.pid);
    }
    catch {
        // Owner file not written yet: give the holder the benefit of the doubt until staleMs.
        return false;
    }
}
export async function withLock(dir, fn, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const staleMs = options.staleMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0;; attempt++) {
        try {
            await mkdir(dir);
            break;
        }
        catch (e) {
            const code = e.code;
            if (code === "ENOENT") {
                await mkdir(join(dir, ".."), { recursive: true });
                continue;
            }
            if (code !== "EEXIST")
                throw e;
            if (await isStale(dir, staleMs)) {
                await rm(dir, { recursive: true, force: true });
                continue;
            }
            if (Date.now() > deadline)
                throw options.onTimeout?.() ?? new AiCliError("REGISTRY_LOCKED", "the shared account registry is busy", { meta: { lock: dir } });
            await sleep(Math.min(200, 5 * 2 ** Math.min(attempt, 5)) + Math.random() * 10);
        }
    }
    const heartbeat = setInterval(() => {
        const now = new Date();
        utimes(dir, now, now).catch(() => undefined);
    }, Math.max(250, staleMs / 3));
    heartbeat.unref();
    try {
        await writeFile(join(dir, "owner.json"), JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString() }));
        return await fn();
    }
    finally {
        clearInterval(heartbeat);
        await rm(dir, { recursive: true, force: true });
    }
}
/** Serializes async work within this process, by key. */
export class KeyedMutex {
    tails = new Map();
    run(key, fn) {
        const previous = this.tails.get(key) ?? Promise.resolve();
        const next = previous.then(fn, fn);
        const tail = next.catch(() => undefined);
        this.tails.set(key, tail);
        void tail.then(() => {
            if (this.tails.get(key) === tail)
                this.tails.delete(key);
        });
        return next;
    }
}
