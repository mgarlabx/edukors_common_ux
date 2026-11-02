import { spawn, spawnSync } from "node:child_process";
import { AiError } from "../errors.js";
/**
 * Process lifecycle for provider CLIs: bounded output, timeouts and reliable
 * termination of the whole process tree.
 */
const WINDOWS = process.platform === "win32";
/** Windows batch shims (npm installs `.cmd` files) cannot be spawned without a shell. */
const needsShell = (file) => WINDOWS && /\.(cmd|bat)$/i.test(file);
/** Quotes an argument for cmd.exe. Arguments come from adapters, never from users. */
const cmdQuote = (arg) => (/^[\w\-./:=@\\]+$/.test(arg) ? arg : `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/%/g, "%%")}"`);
/**
 * Windows runs a script only through its interpreter: a Node script (an npm
 * install's `cli.js`, a test fixture) runs with the Node running this, which
 * in Electron is the application itself, told to act as Node.
 */
const isNodeScript = (file) => WINDOWS && /\.[cm]?js$/i.test(file);
function spawnRaw(spec) {
    if (isNodeScript(spec.file)) {
        const env = { ...(spec.env ?? process.env), ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}) };
        return spawnRaw({ ...spec, file: process.execPath, args: [spec.file, ...(spec.args ?? [])], env });
    }
    const args = spec.args ?? [];
    const shell = needsShell(spec.file);
    return spawn(shell ? `"${spec.file}"` : spec.file, shell ? args.map(cmdQuote) : args, {
        env: spec.env ?? process.env,
        cwd: spec.cwd,
        shell,
        windowsHide: true,
        // Own process group on POSIX, so the whole tree can be signalled.
        detached: !WINDOWS,
        stdio: ["pipe", "pipe", "pipe"],
    });
}
/** Keeps the last `limit` characters of a stream. */
export class Tail {
    limit;
    text = "";
    constructor(limit = 16_384) {
        this.limit = limit;
    }
    push(chunk) {
        this.text += chunk;
        if (this.text.length > this.limit)
            this.text = this.text.slice(-this.limit);
    }
    toString() {
        return this.text;
    }
}
const live = new Set();
export class ManagedProcess {
    child;
    stderr = new Tail();
    exited;
    exitInfo = null;
    constructor(spec) {
        this.child = spawnRaw(spec);
        this.child.stderr.setEncoding("utf8").on("data", (chunk) => this.stderr.push(chunk));
        this.child.stdin.on("error", () => undefined);
        live.add(this);
        this.exited = new Promise((resolve) => {
            const done = (info) => {
                if (this.exitInfo)
                    return;
                this.exitInfo = info;
                live.delete(this);
                resolve(info);
            };
            this.child.once("exit", (code, signal) => done({ code, signal }));
            this.child.once("error", () => done({ code: null, signal: null }));
        });
    }
    get running() {
        return this.exitInfo === null;
    }
    /** Writes one JSON object followed by a newline. Returns false if the process is gone. */
    writeLine(message) {
        if (!this.running || this.child.stdin.destroyed)
            return false;
        this.child.stdin.write(JSON.stringify(message) + "\n");
        return true;
    }
    /** Ends the whole process tree: a polite signal, then a forced one after `graceMs`. */
    async terminate(graceMs = 2_000) {
        if (!this.running)
            return this.exitInfo;
        try {
            this.child.stdin.end();
        }
        catch {
            /* already closed */
        }
        killTree(this.child.pid, "SIGTERM");
        const timer = new Promise((r) => setTimeout(() => r(null), graceMs).unref());
        if ((await Promise.race([this.exited, timer])) === null)
            killTree(this.child.pid, "SIGKILL");
        return this.exited;
    }
}
function killTree(pid, signal) {
    if (!pid)
        return;
    if (WINDOWS) {
        spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        return;
    }
    try {
        process.kill(-pid, signal);
    }
    catch {
        try {
            process.kill(pid, signal);
        }
        catch {
            /* already gone */
        }
    }
}
/** Kills every process this library started. Safe to call from `process.on("exit")`. */
export function killAllSync() {
    for (const proc of live)
        killTree(proc.child.pid, "SIGKILL");
    live.clear();
}
process.once("exit", killAllSync);
/** Runs a short command to completion with a timeout and bounded output. Never rejects for a non-zero exit. */
export async function runCommand(spec) {
    const maxOutput = spec.maxOutput ?? 1 << 20;
    let proc;
    try {
        proc = new ManagedProcess(spec);
    }
    catch (e) {
        throw new AiError("PROVIDER_START_FAILED", `could not start ${spec.file}`, { cause: e });
    }
    let stdout = "";
    proc.child.stdout.setEncoding("utf8").on("data", (chunk) => {
        if (stdout.length < maxOutput)
            stdout += chunk.slice(0, maxOutput - stdout.length);
    });
    if (spec.input !== undefined)
        proc.child.stdin.end(spec.input);
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        void proc.terminate(500);
    }, spec.timeoutMs ?? 15_000);
    const onAbort = () => void proc.terminate(500);
    spec.signal?.addEventListener("abort", onAbort, { once: true });
    const spawnError = new Promise((resolve) => proc.child.once("error", resolve));
    const info = await proc.exited;
    clearTimeout(timer);
    spec.signal?.removeEventListener("abort", onAbort);
    if (info.code === null && info.signal === null) {
        throw new AiError("PROVIDER_START_FAILED", `could not start ${spec.file}`, { cause: await spawnError });
    }
    if (spec.signal?.aborted)
        throw new AiError("CANCELLED", "cancelled");
    return { code: info.code, stdout, stderr: proc.stderr.toString(), timedOut };
}
/**
 * Splits a stream into lines. A line longer than `maxLineBytes` is discarded
 * and reported, so a misbehaving process cannot exhaust memory.
 */
export function readLines(stream, onLine, options = {}) {
    const max = options.maxLineBytes ?? 8 << 20;
    let buffer = "";
    let discarding = false;
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
        let start = 0;
        for (let i = chunk.indexOf("\n"); i !== -1; i = chunk.indexOf("\n", start)) {
            const piece = chunk.slice(start, i);
            if (!discarding)
                onLine((buffer + piece).replace(/\r$/, ""));
            buffer = "";
            discarding = false;
            start = i + 1;
        }
        if (discarding)
            return;
        buffer += chunk.slice(start);
        if (buffer.length > max) {
            buffer = "";
            discarding = true;
            options.onOverflow?.();
        }
    });
    stream.on("end", () => {
        if (buffer && !discarding)
            onLine(buffer);
        buffer = "";
    });
}
