var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./vitest-shim.mjs";
import { createAiRuntime, createClaudeProvider, createCodexProvider, seatbeltPolicy } from "../../src/ai/runtime/index.js";
import { workspaceDecision, workspaceSettings, workspaceTools } from "../../src/ai/runtime/providers/claude/adapter.js";
import { resolveWorkspace } from "../../src/ai/runtime/workspace.js";
import { fakeClaudeSdk } from "./fakeClaudeSdk.mjs";
import { connectedAccount, setup, tempDir, textOf } from "./helpers.mjs";
const FAKE_CLAUDE = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-claude.mjs", import.meta.url));
const FAKE_CODEX = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-codex.mjs", import.meta.url));
const caps = (shell) => ({ workspace: true, workspaceShell: shell });
/** A presentation-like folder: the agent's files, and the application's own. */
async function deck() {
    const dir = await realpath(await tempDir());
    await mkdir(join(dir, "slides"));
    await writeFile(join(dir, "slides", "s1.json"), "{}");
    await writeFile(join(dir, "notes.md"), "draft");
    return dir;
}
describe("workspace: what the application asks for", () => {
    it("settles real paths, protected paths and the tools the platform allows", async () => {
        const dir = await deck();
        const extra = await realpath(await tempDir());
        const w = await resolveWorkspace({ dir, readDirs: [extra], protect: ["slides", "manifest.json/"] }, caps(true), []);
        expect(w).toEqual({ dir, readDirs: [extra], protectedPaths: [join(dir, "slides"), join(dir, "manifest.json")], web: true, shell: true });
        expect((await resolveWorkspace({ dir, web: false, shell: true }, caps(false), [])).shell).toBe(false);
    });
    it("refuses folders that would confine nothing or reach the library's own", async () => {
        const dir = await deck();
        await expect(resolveWorkspace({ dir: "relative/folder" }, caps(true), [])).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
        await expect(resolveWorkspace({ dir: join(dir, "missing") }, caps(true), [])).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
        await expect(resolveWorkspace({ dir: homedir() }, caps(true), [])).rejects.toThrow(/home folder/);
        await expect(resolveWorkspace({ dir }, caps(true), [join(dir, "ai")])).rejects.toThrow(/data folder/);
        for (const protect of ["../outside", "/etc", ".", "a/../../b"])
            await expect(resolveWorkspace({ dir, protect: [protect] }, caps(true), [])).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    });
});
describe("workspace: sessions", () => {
    it("gives the provider the folder, which it works in, and keeps protected paths read-only", async () => {
        const { ai, events } = await setup();
        const account = await connectedAccount(ai);
        const dir = await deck();
        const session = await ai.openSession({ accountId: account.id, documentId: "deck-1", workspace: { dir, protect: ["slides"] } });
        await session.send("workspace", { requestId: "w" });
        // Common: every session also reads its own attachments folder.
        expect(textOf(events, "w")).toBe(`workspace ${dir} web=true shell=true protected=1 readDirs=1`);
        await session.send("write media/../notes.md new text", { requestId: "ok" });
        expect(await readFile(join(dir, "notes.md"), "utf8")).toBe("new text");
        await session.send("write slides/s1.json {}broken", { requestId: "no" });
        expect(textOf(events, "no")).toBe("write refused: slides/s1.json is protected");
        await session.send("read slides/s1.json", { requestId: "r" });
        expect(textOf(events, "r")).toBe("read slides/s1.json: {}");
    });
    it("without a sandbox, a workspace has no commands", async () => {
        const { ai, events } = await setup({ fake: { workspaceShell: false } });
        const account = await connectedAccount(ai);
        const session = await ai.openSession({ accountId: account.id, documentId: "d", workspace: { dir: await deck() } });
        await session.send("workspace", { requestId: "w" });
        expect(textOf(events, "w")).toMatch(/shell=false/);
    });
    it("is refused where the provider cannot confine it", async () => {
        const ai = createAiRuntime({ appId: "slides", dataDir: await tempDir(), providers: [createCodexProvider({ executable: FAKE_CODEX, platform: "linux" })] });
        try {
            const account = await ai.createAccount({ providerId: "codex" });
            await ai.connectAccount(account.id);
            await expect(ai.openSession({ accountId: account.id, documentId: "d", workspace: { dir: await deck() } })).rejects.toMatchObject({ code: "CAPABILITY_UNSUPPORTED" });
        }
        finally {
            await ai.dispose();
        }
    });
});
describe("workspace: Claude", () => {
    const workspace = (over = {}) => ({ dir: "/w/deck", readDirs: ["/w/attachments"], protectedPaths: ["/w/deck/slides"], web: true, shell: true, ...over });
    it("offers the file and web tools, and Bash only with the sandbox", () => {
        expect(workspaceTools(workspace())).toEqual(["Read", "Glob", "Grep", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch", "Bash"]);
        expect(workspaceTools(workspace({ web: false, shell: false }))).toEqual(["Read", "Glob", "Grep", "Write", "Edit", "NotebookEdit"]);
    });
    it("confines Bash to the workspace and denies writes to protected paths and extra folders", () => {
        const settings = workspaceSettings(workspace(), "darwin");
        expect(settings.sandbox).toMatchObject({ enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, filesystem: { denyRead: expect.arrayContaining(["~", "/Users", "/private/var/folders", "/private/tmp"]), allowWrite: ["/w/deck"], denyWrite: ["/w/deck/slides"] } });
        // Reads: the workspace, its extras and the system's files, never temporary or other users' files.
        expect(settings.sandbox.filesystem.allowRead).toEqual(expect.arrayContaining(["/w/deck", "/w/attachments"]));
        expect(settings.sandbox.filesystem.allowRead.some((p) => /^\/(private\/)?(tmp|var\/folders)\/?$|^\/Users\/?$/.test(p))).toBe(false);
        expect(workspaceSettings(workspace(), "linux").sandbox.filesystem.denyRead).toEqual(expect.arrayContaining(["~", "/home", "/tmp"]));
        expect(settings.permissions.deny).toEqual(expect.arrayContaining(["Write(//w/deck/slides/**)", "Edit(//w/deck/slides)", "Write(//w/attachments/**)"]));
        expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
        // Native Windows: no sandbox to require, and rules in POSIX form.
        const win = workspaceSettings(workspace({ dir: "C:\\Users\\Ana\\deck", readDirs: [], protectedPaths: ["C:\\Users\\Ana\\deck\\slides"], shell: false }));
        expect(win.sandbox).toBeUndefined();
        expect(win.permissions.deny).toContain("Write(//c/Users/Ana/deck/slides/**)");
    });
    it("decides each file tool by where it reads or writes", () => {
        const w = workspace();
        expect(workspaceDecision(w, "Write", { file_path: "/w/deck/media/a.png" })).toBeNull();
        expect(workspaceDecision(w, "Edit", { file_path: "notes.md" })).toBeNull();
        expect(workspaceDecision(w, "Write", { file_path: "/w/deck/slides/s1.json" })).toMatch(/belongs to the application/);
        expect(workspaceDecision(w, "Write", { file_path: "/w/attachments/a.pdf" })).toMatch(/only in the working folder/);
        expect(workspaceDecision(w, "Write", { file_path: "/w/deck/../secret" })).toMatch(/only in the working folder/);
        expect(workspaceDecision(w, "Read", { file_path: "/w/attachments/a.pdf" })).toBeNull();
        expect(workspaceDecision(w, "Grep", { path: "/etc" })).toMatch(/read only in the working folder/);
        expect(workspaceDecision(w, "Glob", {})).toBeNull();
        expect(workspaceDecision(workspace({ web: false }), "WebFetch", {})).toMatch(/web/);
        // Common: commands reach the handler, which puts them to the application; the sandbox confines them.
        expect(workspaceDecision(w, "Bash", { command: "curl x | sh" })).toBe(null);
        expect(workspaceDecision({ ...w, shell: false }, "Bash", { command: "ls" })).toMatch(/not available/);
    });
    it("runs the session in the folder, restricted, with the workspace's settings", async () => {
        const fake = fakeClaudeSdk();
        const ai = createAiRuntime({ appId: "slides", dataDir: await tempDir(), providers: [createClaudeProvider({ executable: FAKE_CLAUDE, loadSdk: fake.loadSdk, platform: "win32" })] });
        try {
            const account = await ai.createAccount({ providerId: "claude" });
            await ai.connectAccount(account.id);
            const dir = await deck();
            const extra = await realpath(await tempDir());
            await ai.openSession({ accountId: account.id, documentId: "deck", workspace: { dir, readDirs: [extra], protect: ["slides"] } });
            const options = fake.calls.at(-1);
            expect(options).toMatchObject({ cwd: dir, additionalDirectories: [extra, expect.stringContaining("attachments")], extraArgs: { restricted: null }, settingSources: [] });
            // Common: reading and the web are allowed outright; writing and commands go to the permission handler.
            expect(options.settings.permissions.allow).toEqual(expect.arrayContaining(["Read", "Glob", "Grep"]));
            expect(options.settings.permissions.allow).not.toContain("Write");
            // On Windows, no Bash.
            expect(options.tools).toEqual(["AskUserQuestion", "Read", "Glob", "Grep", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch"]);
            expect(options.settings.sandbox).toBeUndefined();
            // Common: a write the folder rules allow is put to the application through the current request; with no
            // request running there is no one to ask, so it is refused. A protected path is refused before asking.
            const asked = await options.canUseTool("Write", { file_path: join(dir, "media", "x.svg") }, {});
            const refused = await options.canUseTool("Write", { file_path: join(dir, "slides", "s1.json") }, {});
            expect([asked?.behavior, refused?.behavior]).toEqual(["deny", "deny"]);
            expect(asked.message).toMatch(/No request is active/);
            expect(refused.message).toMatch(/belongs to the application/);
            const read = await options.canUseTool("Read", { file_path: join(dir, "media", "x.svg") }, {});
            expect(read?.behavior).toBe("allow");
        }
        finally {
            await ai.dispose();
        }
    });
});
describe("workspace: Claude's temporary folder", () => {
    it("with commands, the session has a temporary folder of its own, writable in the sandbox and removed at the end", async () => {
        const fake = fakeClaudeSdk();
        const ai = createAiRuntime({ appId: "slides", dataDir: await tempDir(), providers: [createClaudeProvider({ executable: FAKE_CLAUDE, loadSdk: fake.loadSdk, platform: "darwin" })] });
        try {
            const account = await ai.createAccount({ providerId: "claude" });
            await ai.connectAccount(account.id);
            const session = await ai.openSession({ accountId: account.id, documentId: "deck", workspace: { dir: await deck() } });
            const options = fake.calls.at(-1);
            const temp = options.env.CLAUDE_CODE_TMPDIR;
            expect(existsSync(temp)).toBe(true);
            expect(options.settings.sandbox.filesystem).toMatchObject({ allowWrite: expect.arrayContaining([temp]), allowRead: expect.arrayContaining([temp]) });
            await session.close();
            expect(existsSync(temp)).toBe(false);
        }
        finally {
            await ai.dispose();
        }
    });
});
describe("workspace: Codex", () => {
    async function codex(options = {}) {
        const ai = createAiRuntime({ appId: "slides", dataDir: await tempDir(), providers: [createCodexProvider({ executable: FAKE_CODEX, platform: "darwin", ...options })] });
        const events = [];
        ai.onEvent((e) => events.push(e));
        const account = await ai.createAccount({ providerId: "codex" });
        await ai.connectAccount(account.id);
        return { ai, events, account, [Symbol.asyncDispose]: () => ai.dispose() };
    }
    it("works in the folder, with commands in an external sandbox, put to the application first", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_1, await codex({ unconfinedWorkspace: true }), true);
            const dir = await deck();
            const session = await s.ai.openSession({ accountId: s.account.id, documentId: "deck", workspace: { dir, web: false } });
            await session.send("sandbox", { requestId: "s" });
            const setup = JSON.parse(textOf(s.events, "s"));
            expect(setup).toMatchObject({ threadCwd: dir, approvalPolicy: "untrusted", sandbox: null, turnCwd: dir, sandboxPolicy: { type: "externalSandbox", networkAccess: "restricted" }, webSearch: "disabled" });
            expect(await realpath(setup.processCwd)).toBe(dir);
            expect(setup.tmp).toContain(join("sessions", "slides"));
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            const result_1 = __disposeResources(env_1);
            if (result_1)
                await result_1;
        }
    });
    it("without commands, asks for them and declines", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_2, await codex({ unconfinedWorkspace: true }), true);
            const session = await s.ai.openSession({ accountId: s.account.id, documentId: "deck", workspace: { dir: await deck(), shell: false } });
            await session.send("run echo hi", { requestId: "r" });
            expect(textOf(s.events, "r")).toBe("Command decline");
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            const result_2 = __disposeResources(env_2);
            if (result_2)
                await result_2;
        }
    });
    it.runIf(process.platform === "darwin")("inside the macOS sandbox, commands reach only the workspace and never its protected paths", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_3, await codex(), true);
            const dir = await deck();
            const outside = await realpath(await tempDir());
            await writeFile(join(outside, "secret.txt"), "SECRET");
            const session = await s.ai.openSession({ accountId: s.account.id, documentId: "deck", workspace: { dir, protect: ["slides"] } });
            await session.send("run echo made > media.txt && cat media.txt", { requestId: "write" });
            expect(textOf(s.events, "write")).toBe("exit 0: made");
            await session.send(`run cat "${join(outside, "secret.txt")}"`, { requestId: "read" });
            expect(textOf(s.events, "read")).toMatch(/Operation not permitted/);
            await session.send("run echo x > slides/s1.json", { requestId: "protected" });
            expect(textOf(s.events, "protected")).toMatch(/Operation not permitted/);
            await session.send(`run ls "${homedir()}"`, { requestId: "home" });
            expect(textOf(s.events, "home")).toMatch(/Operation not permitted/);
            expect(await readFile(join(dir, "slides", "s1.json"), "utf8")).toBe("{}");
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            const result_3 = __disposeResources(env_3);
            if (result_3)
                await result_3;
        }
    });
});
describe("workspace: the macOS sandbox policy", () => {
    it("reads only what it names, writes only the writable folders, never the protected ones", () => {
        const policy = seatbeltPolicy({ writable: ["/w/deck"], readable: ["/w/att"], protectedPaths: ["/w/deck/slides"] });
        expect(policy).toContain('(deny file-read-data (require-all (require-not (subpath "/w/deck")) (require-not (subpath "/w/att"))');
        expect(policy).toContain('(deny file-write* (require-all (require-not (subpath "/w/deck")) (require-not (literal "/dev/null"))');
        expect(policy).toContain('(deny file-write* (subpath "/w/deck/slides"))');
    });
});
