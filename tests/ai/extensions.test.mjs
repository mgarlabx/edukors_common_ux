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
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./vitest-shim.mjs";
import { createAiCli, createClaudeProvider, createCodexProvider } from "../../src/ai/runtime/index.js";
import { fakeClaudeSdk } from "./fakeClaudeSdk.mjs";
import { createFakeProvider } from "../../src/ai/runtime/testing/index.js";
import { tempDir, textOf } from "./helpers.mjs";
const FAKE_CLAUDE = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-claude.mjs", import.meta.url));
const FAKE_CODEX = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-codex.mjs", import.meta.url));
const FAKE_MCP = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-mcp-server.mjs", import.meta.url));
const glossary = { glossary: { command: process.execPath, args: [FAKE_MCP], env: { FAKE_MCP_SECRET: "s3" } } };
const providers = [
    {
        id: "claude",
        make: () => {
            const fake = fakeClaudeSdk();
            return { adapter: createClaudeProvider({ executable: FAKE_CLAUDE, loadSdk: fake.loadSdk }), calls: fake.calls };
        },
    },
    { id: "codex", make: () => ({ adapter: createCodexProvider({ executable: FAKE_CODEX }) }) },
    { id: "fake", make: () => ({ adapter: createFakeProvider() }) },
];
async function setup(id) {
    const made = providers.find((p) => p.id === id).make();
    const ai = createAiCli({ appId: "graph", dataDir: await tempDir(), interruptGraceMs: 400, providers: [made.adapter] });
    const events = [];
    ai.onEvent((e) => events.push(e));
    const account = await ai.createAccount({ providerId: id });
    await ai.connectAccount(account.id);
    return { ai, account, events, calls: made.calls, [Symbol.asyncDispose]: () => ai.dispose() };
}
describe.each(["claude", "codex", "fake"])("%s: the user's MCP servers", (id) => {
    it("offers a user's server through the core, authorized by the application", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_1, await setup(id), true);
            const asked = [];
            const session = await s.ai.openSession({
                accountId: s.account.id,
                documentId: "course-1",
                mcpServers: glossary,
                authorize: ({ signal, ...request }) => (asked.push(request), { allow: true }),
            });
            expect(s.events.find((e) => e.type === "mcpServerStatus")).toMatchObject({ server: "glossary", status: "connected", tools: 2 });
            await session.send('mcp glossary lookup {"term":"vetor"}', { requestId: "r" });
            expect(textOf(s.events, "r")).toBe("glossary.lookup said: vetor: a term from the glossary (env s3)");
            expect(asked).toEqual([{ kind: "mcp", callId: expect.any(String), server: "glossary", tool: "lookup", input: { term: "vetor" }, documentId: "course-1", requestId: "r" }]);
            expect(s.events.filter((e) => e.requestId === "r" && e.type.startsWith("tool"))).toMatchObject([
                { type: "toolStarted", tool: "mcp__glossary__lookup" },
                { type: "toolCompleted", tool: "mcp__glossary__lookup", ok: true },
            ]);
            await session.send("mcp glossary broken", { requestId: "b" });
            expect(textOf(s.events, "b")).toBe("glossary.broken said: the glossary is offline (error)");
            expect(s.events.find((e) => e.requestId === "b" && e.type === "toolCompleted")).toMatchObject({ ok: false, errorCode: "TOOL_FAILED" });
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
    it("does not call the server when the application declines, or has no authorizer", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_2, await setup(id), true);
            const declined = await s.ai.openSession({ accountId: s.account.id, documentId: "d", mcpServers: glossary, authorize: () => ({ allow: false, message: "Not now." }) });
            await declined.send('mcp glossary lookup {"term":"x"}', { requestId: "no" });
            expect(textOf(s.events, "no")).toBe("glossary.lookup said: Not now. (error)");
            expect(s.events.find((e) => e.requestId === "no" && e.type === "toolCompleted")).toMatchObject({ ok: false, errorCode: "TOOL_DENIED" });
            const unattended = await s.ai.openSession({ accountId: s.account.id, documentId: "e", mcpServers: glossary });
            await unattended.send('mcp glossary lookup {"term":"x"}', { requestId: "none" });
            expect(s.events.find((e) => e.requestId === "none" && e.type === "toolCompleted")).toMatchObject({ errorCode: "TOOL_DENIED" });
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
    it("reports servers that cannot be used, and opens the session anyway", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_3, await setup(id), true);
            const session = await s.ai.openSession({
                accountId: s.account.id,
                documentId: "d",
                mcpServers: { "bad name!": { command: "x" }, edukors: { command: "x" }, missing: { command: "/no/such/server" }, noUrl: { type: "http" } },
                authorize: () => ({ allow: true }),
            });
            const statuses = s.events.filter((e) => e.type === "mcpServerStatus").map((e) => ({ server: e.server, status: e.status }));
            expect(statuses).toEqual(expect.arrayContaining([
                { server: "bad name!", status: "failed" },
                { server: "edukors", status: "failed" },
                { server: "missing", status: "failed" },
                { server: "noUrl", status: "failed" },
            ]));
            expect((await session.send("hello")).status).toBe("completed");
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
describe("skills", () => {
    async function skillsFolder() {
        const dir = join(await tempDir(), "skills");
        for (const [folder, name] of [["course-outline", "course-outline"], ["quiz", "Quiz Writer"]]) {
            mkdirSync(join(dir, folder), { recursive: true });
            writeFileSync(join(dir, folder, "SKILL.md"), `---\nname: ${name}\ndescription: Helps with ${folder}.\n---\n\nInstructions.\n`);
        }
        return dir;
    }
    it("claude: offers only the application's skills, through a local plugin", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_4, await setup("claude"), true);
            const dir = await skillsFolder();
            await s.ai.openSession({ accountId: s.account.id, documentId: "d", skillsDir: dir });
            const options = s.calls.at(-1);
            expect(options.tools).toEqual(["AskUserQuestion", "Skill"]);
            expect(new Set(options.skills)).toEqual(new Set(["edukors:course-outline", "edukors:quiz", "edukors:Quiz Writer"]));
            const plugin = options.plugins[0].path;
            expect(JSON.parse(readFileSync(join(plugin, ".claude-plugin", "plugin.json"), "utf8"))).toMatchObject({ name: "edukors" });
            expect(lstatSync(join(plugin, "skills")).isSymbolicLink()).toBe(true);
            expect(existsSync(join(plugin, "skills", "quiz", "SKILL.md"))).toBe(true);
            // Loading a skill is allowed; other built-in tools are not.
            expect(await options.canUseTool("Skill", { skill: "edukors:quiz" }, {})).toMatchObject({ behavior: "allow" });
            expect(await options.canUseTool("Bash", { command: "ls" }, {})).toMatchObject({ behavior: "deny" });
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            const result_4 = __disposeResources(env_4);
            if (result_4)
                await result_4;
        }
    });
    it("claude: without a skills folder, no skill is offered", async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_5, await setup("claude"), true);
            await s.ai.openSession({ accountId: s.account.id, documentId: "d" });
            const options = s.calls.at(-1);
            expect(options.tools).toEqual(["AskUserQuestion"]);
            expect(options.plugins).toBeUndefined();
            expect(await options.canUseTool("Skill", {}, {})).toMatchObject({ behavior: "deny" });
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            const result_5 = __disposeResources(env_5);
            if (result_5)
                await result_5;
        }
    });
    it("codex: serves the application's skills through read_skill, with every native skill off", async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_6, await setup("codex"), true);
            const dir = await skillsFolder();
            mkdirSync(join(dir, "quiz", "references"));
            writeFileSync(join(dir, "quiz", "references", "rubric.md"), "Rubric text.");
            writeFileSync(join(dir, "..", "secret.txt"), "outside");
            const session = await s.ai.openSession({ accountId: s.account.id, documentId: "d", skillsDir: dir });
            // Codex reads native skills with shell commands: all of them are off, the application's included.
            expect(JSON.parse(readFileSync(join(s.account.homeDir, "skill-switches.json"), "utf8"))).toEqual({ "/bundled/imagegen/SKILL.md": false });
            await session.send("developer", { requestId: "dev" });
            expect(textOf(s.events, "dev")).toContain("- course-outline: Helps with course-outline.");
            expect(textOf(s.events, "dev")).toContain("- Quiz Writer: Helps with quiz.");
            await session.send("skill course-outline", { requestId: "read" });
            expect(textOf(s.events, "read")).toContain("Instructions.");
            await session.send("skill quiz references/rubric.md", { requestId: "file" });
            expect(textOf(s.events, "file")).toBe("Rubric text.");
            await session.send("skill quiz ../../secret.txt", { requestId: "escape" });
            expect(textOf(s.events, "escape")).toBe("error: the file must be a path inside the skill's folder");
            expect(s.events.filter((e) => e.requestId === "read" && e.type === "activity").map((e) => e.phase)).toContain("reading");
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            const result_6 = __disposeResources(env_6);
            if (result_6)
                await result_6;
        }
    });
    it("codex: without a skills folder, nothing about skills is offered", async () => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_7, await setup("codex"), true);
            const session = await s.ai.openSession({ accountId: s.account.id, documentId: "d" });
            await session.send("developer", { requestId: "dev" });
            expect(textOf(s.events, "dev")).toBe("none");
            await session.send("skill quiz", { requestId: "read" });
            expect(textOf(s.events, "read")).toBe("error: no MCP server edukors");
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            const result_7 = __disposeResources(env_7);
            if (result_7)
                await result_7;
        }
    });
    it("refuses a relative skills folder", async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_8, await setup("codex"), true);
            await expect(s.ai.openSession({ accountId: s.account.id, documentId: "d", skillsDir: "skills" })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            const result_8 = __disposeResources(env_8);
            if (result_8)
                await result_8;
        }
    });
});
describe("skill files", () => {
    it("finds skills by name or folder, reads folded descriptions, and stays inside the skill", async () => {
        const { listSkills, readSkillFile } = await import("../../src/ai/runtime/skills.js");
        const { symlinkSync } = await import("node:fs");
        const root = await tempDir();
        const dir = join(root, "skills");
        mkdirSync(join(dir, "writer"), { recursive: true });
        writeFileSync(join(dir, "writer", "SKILL.md"), "---\nname: \"Quiz Writer\"\ndescription: >\n  Writes quizzes\n  for courses.\n---\nBody.");
        writeFileSync(join(root, "outside.txt"), "secret");
        symlinkSync(join(root, "outside.txt"), join(dir, "writer", "link.txt"));
        expect(listSkills(dir)).toEqual([{ folder: "writer", name: "Quiz Writer", description: "Writes quizzes for courses." }]);
        expect(readSkillFile(dir, "Quiz Writer")).toContain("Body.");
        expect(readSkillFile(dir, "writer")).toContain("Body.");
        expect(() => readSkillFile(dir, "writer", "link.txt")).toThrow("inside the skill's folder");
        expect(() => readSkillFile(dir, "writer", "/etc/hosts")).toThrow("inside the skill's folder");
        expect(() => readSkillFile(dir, "nobody")).toThrow('there is no skill named "nobody"');
    });
});
describe("over the stdio host", () => {
    it("asks the application to authorize each call to a user's server", async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const { PassThrough } = await import("node:stream");
            const { createInterface } = await import("node:readline");
            const { runStdioHost } = await import("../../src/ai/runtime/host/stdio.js");
            const s = __addDisposableResource(env_9, await setup("codex"), true);
            const input = new PassThrough();
            const output = new PassThrough();
            const host = runStdioHost({ ai: s.ai, input, output });
            const waiting = new Map();
            const authorizations = [];
            createInterface({ input: output }).on("line", (line) => {
                const m = JSON.parse(line);
                if (m.method === "tool.authorize") {
                    authorizations.push(m.params);
                    const allow = authorizations.length > 1;
                    input.write(JSON.stringify({ id: m.id, result: allow ? { allow: true } : { allow: false, message: "Ask me first." } }) + "\n");
                }
                else if (typeof m.id === "number")
                    waiting.get(m.id)?.(m);
            });
            let next = 1;
            const call = (method, params) => new Promise((resolve) => {
                const id = next++;
                waiting.set(id, resolve);
                input.write(JSON.stringify({ id, method, params }) + "\n");
            });
            const { sessionId } = (await call("session.open", { accountId: s.account.id, documentId: "c1", mcpServers: glossary })).result;
            await call("session.send", { sessionId, text: 'mcp glossary lookup {"term":"a"}', requestId: "r1" });
            await call("session.send", { sessionId, text: 'mcp glossary lookup {"term":"b"}', requestId: "r2" });
            expect(textOf(s.events, "r1")).toBe("glossary.lookup said: Ask me first. (error)");
            expect(textOf(s.events, "r2")).toBe("glossary.lookup said: b: a term from the glossary (env s3)");
            expect(authorizations).toEqual([
                { sessionId, kind: "mcp", callId: expect.any(String), server: "glossary", tool: "lookup", input: { term: "a" }, documentId: "c1", requestId: "r1" },
                { sessionId, kind: "mcp", callId: expect.any(String), server: "glossary", tool: "lookup", input: { term: "b" }, documentId: "c1", requestId: "r2" },
            ]);
            input.end();
            await host.closed;
        }
        catch (e_9) {
            env_9.error = e_9;
            env_9.hasError = true;
        }
        finally {
            const result_9 = __disposeResources(env_9);
            if (result_9)
                await result_9;
        }
    });
});
describe("settings: MCP configuration", () => {
    it("accepts the .mcp.json shape or a bare object, and reports every problem", async () => {
        const { parseMcpConfig } = await import("../../src/ai/runtime/index.js");
        const text = JSON.stringify({
            mcpServers: {
                files: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Courses"] },
                docs: { type: "http", url: "https://example.org/mcp", timeout: 30000 },
                edukors: { command: "x" },
                "my.server": { command: "x" },
                nourl: { type: "sse", url: "ftp://x" },
                weird: { type: "websocket", url: "wss://x" },
                badargs: { command: "x", args: "not-a-list" },
            },
        });
        const { servers, problems } = parseMcpConfig(text);
        expect(servers).toEqual({
            files: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Courses"] },
            docs: { type: "http", url: "https://example.org/mcp", timeout: 30000 },
        });
        expect(problems).toEqual([
            { code: "reserved", server: "edukors" },
            { code: "badName", server: "my.server" },
            { code: "noUrl", server: "nourl" },
            { code: "badType", server: "weird", detail: "websocket" },
            { code: "badField", server: "badargs", field: "args" },
        ]);
        expect(parseMcpConfig('{ "a": { "command": "x" } }').servers).toEqual({ a: { type: "stdio", command: "x" } });
        expect(parseMcpConfig("").problems).toEqual([]);
        expect(parseMcpConfig("{ nope").problems[0]).toMatchObject({ code: "notJson" });
        expect(parseMcpConfig("[1]").problems).toEqual([{ code: "notServers" }]);
    });
});
