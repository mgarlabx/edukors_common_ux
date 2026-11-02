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
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./vitest-shim.mjs";
import { z } from "zod";
import { createAiRuntime, createClaudeProvider, defineTool } from "../../src/ai/runtime/index.js";
import { interpret } from "../../src/ai/runtime/providers/claude/events.js";
import { fakeClaudeSdk } from "./fakeClaudeSdk.mjs";
import { tempDir, textOf, until } from "./helpers.mjs";
const FAKE_CLAUDE = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-claude.mjs", import.meta.url));
async function setup(options = {}) {
    const fake = fakeClaudeSdk();
    const ai = createAiRuntime({ appId: "graph", dataDir: await tempDir(), interruptGraceMs: 400, providers: [createClaudeProvider({ executable: FAKE_CLAUDE, loadSdk: fake.loadSdk, ...options })] });
    const events = [];
    ai.onEvent((e) => events.push(e));
    const connected = async (label = "Personal") => {
        const account = await ai.createAccount({ providerId: "claude", label });
        await ai.connectAccount(account.id);
        return account;
    };
    return { ai, fake, events, connected, [Symbol.asyncDispose]: () => ai.dispose() };
}
describe("claude: installation and accounts", () => {
    it("detects the CLI and its version", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_1, await setup(), true);
            expect(await s.ai.detect("claude")).toMatchObject({ status: "ready", version: "2.1.312", executable: FAKE_CLAUDE });
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
    it("reports an older CLI as incompatible", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_2, await setup({ env: { FAKE_CLAUDE_VERSION: "2.0.77" } }), true);
            expect(await s.ai.detect("claude")).toMatchObject({ status: "incompatible", version: "2.0.77", requiredVersion: "2.1.0" });
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
    it("signs accounts in and out separately, each in its own configuration directory", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_3, await setup(), true);
            const personal = await s.ai.createAccount({ providerId: "claude", label: "Personal" });
            const work = await s.ai.createAccount({ providerId: "claude", label: "Work" });
            expect(await s.ai.accountStatus(personal.id)).toEqual({ state: "disconnected" });
            expect(await s.ai.connectAccount(personal.id)).toEqual({ state: "connected", identity: `${personal.id}@example.org` });
            expect(await s.ai.accountStatus(work.id)).toEqual({ state: "disconnected" });
            await s.ai.connectAccount(work.id);
            await s.ai.logoutAccount(personal.id);
            expect(await s.ai.accountStatus(personal.id)).toEqual({ state: "disconnected" });
            expect(await s.ai.accountStatus(work.id)).toMatchObject({ state: "connected", identity: `${work.id}@example.org` });
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
    it("reports a failed sign-in", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_4, await setup({ env: { FAKE_CLAUDE_LOGIN: "fail" } }), true);
            const account = await s.ai.createAccount({ providerId: "claude" });
            await expect(s.ai.connectAccount(account.id)).rejects.toMatchObject({ code: "LOGIN_FAILED", meta: { detail: "OAuth error: access denied" } });
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
    it("lists models without a model request", async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_5, await setup(), true);
            const account = await s.connected();
            expect(await s.ai.listModels(account.id)).toEqual([
                { id: "default", label: "Default (recommended)", default: true },
                { id: "opus", label: "Opus", efforts: ["low", "high", "max"] },
            ]);
            expect(s.fake.calls.at(-1)).toMatchObject({ persistSession: false, settingSources: [] });
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
    it("refuses to open a session on a signed-out account", async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_6, await setup(), true);
            const account = await s.ai.createAccount({ providerId: "claude" });
            await expect(s.ai.openSession({ accountId: account.id, documentId: "d" })).rejects.toMatchObject({ code: "ACCOUNT_DISCONNECTED" });
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
});
describe("claude: sessions", () => {
    it("runs a request with the editor's configuration and none of the user's", async () => {
        process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-leak-0000000000";
        try {
            const env_7 = { stack: [], error: void 0, hasError: false };
            try {
                const s = __addDisposableResource(env_7, await setup(), true);
                const account = await s.connected();
                const session = await s.ai.openSession({ accountId: account.id, documentId: "course-1", instructions: "You edit the course." });
                expect(await session.send("hello", { requestId: "r" })).toEqual({ requestId: "r", status: "completed" });
                expect(textOf(s.events, "r")).toBe("Echo: hello [history 0, model default]");
                const usage = s.events.filter((e) => e.type === "usageUpdated").map((e) => e.usage);
                expect(usage).toEqual([
                    expect.objectContaining({ limitUsed: 0.42, limitResetsAt: "2033-05-18T03:33:20.000Z", windows: [{ name: "five_hour", used: 0.42, resetsAt: "2033-05-18T03:33:20.000Z" }] }),
                    expect.objectContaining({ inputTokens: 10, outputTokens: 20, cachedInputTokens: 3, costUsd: 0.01 }),
                ]);
                const options = s.fake.calls.at(-1);
                expect(options).toMatchObject({
                    systemPrompt: "You edit the course.",
                    tools: ["AskUserQuestion"],
                    settingSources: [],
                    strictMcpConfig: true,
                    persistSession: true,
                    includePartialMessages: true,
                    pathToClaudeCodeExecutable: FAKE_CLAUDE,
                    sessionId: session.resumeId,
                });
                expect(options.cwd).toContain(join("sessions", "graph"));
                expect(options.env).toMatchObject({ CLAUDE_CONFIG_DIR: account.homeDir, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });
                expect(options.env).not.toHaveProperty("ANTHROPIC_API_KEY");
                expect(options.mcpServers).toEqual({});
                expect(options.allowedTools).toBeUndefined();
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
        }
        finally {
            delete process.env.ANTHROPIC_API_KEY;
        }
    });
    it("serves the application's tools in-process, validated by the core", async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_8, await setup(), true);
            const account = await s.connected();
            const titles = [];
            const setTitle = defineTool({ name: "set_title", description: "Sets the title.", input: z.object({ title: z.string().min(1) }), run: ({ title }) => (titles.push(title), { content: "done" }) });
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d", tools: [setTitle] });
            await session.send('tool set_title {"title":"Física"}', { requestId: "ok" });
            await session.send('tool set_title {"title":""}', { requestId: "bad" });
            expect(titles).toEqual(["Física"]);
            expect(textOf(s.events, "ok")).toBe("Tool set_title said: done");
            expect(textOf(s.events, "bad")).toContain("Invalid arguments for set_title");
            expect(s.events.filter((e) => e.type === "activity" && e.requestId === "ok").map((e) => e.phase)).toEqual(["preparing", "thinking", "applying"]);
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
    it("puts Claude's questions to the user and refuses every other built-in tool", async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_9, await setup(), true);
            const account = await s.connected();
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d" });
            session.on((e) => e.type === "question" && session.answer(e.questionId, "blue"));
            await session.send("ask", { requestId: "q" });
            expect(textOf(s.events, "q")).toBe("You chose blue");
            expect(s.events.find((e) => e.type === "question")).toMatchObject({ prompt: "Which color?", options: ["red", "blue"] });
            await session.send("bash", { requestId: "b" });
            expect(textOf(s.events, "b")).toBe("Bash deny");
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
    it("interrupts and drops output that arrives afterwards", async () => {
        const env_10 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_10, await setup(), true);
            const account = await s.connected();
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d" });
            const pending = session.send("late", { requestId: "late" });
            await until(() => textOf(s.events, "late").length >= 2);
            await session.interrupt();
            expect(await pending).toEqual({ requestId: "late", status: "cancelled" });
            await new Promise((r) => setTimeout(r, 80));
            expect(textOf(s.events)).not.toContain("LATE");
            expect((await session.send("again", { requestId: "next" })).status).toBe("completed");
        }
        catch (e_10) {
            env_10.error = e_10;
            env_10.hasError = true;
        }
        finally {
            const result_10 = __disposeResources(env_10);
            if (result_10)
                await result_10;
        }
    });
    it("recovers from a crash by resuming the same conversation", async () => {
        const env_11 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_11, await setup(), true);
            const account = await s.connected();
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d" });
            await session.send("one", { requestId: "a" });
            const first = session.resumeId;
            expect(await session.send("crash", { requestId: "boom" })).toMatchObject({ status: "failed", error: { code: "PROVIDER_CRASHED" } });
            expect(await session.send("two", { requestId: "b" })).toMatchObject({ status: "completed" });
            expect(s.fake.calls.at(-1)).toMatchObject({ resume: first });
            expect(textOf(s.events, "b")).toBe("Echo: two [history 1, model default]");
        }
        catch (e_11) {
            env_11.error = e_11;
            env_11.hasError = true;
        }
        finally {
            const result_11 = __disposeResources(env_11);
            if (result_11)
                await result_11;
        }
    });
    it("maps Claude's errors and changes the model in place", async () => {
        const env_12 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_12, await setup(), true);
            const account = await s.connected();
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d" });
            expect(await session.send("rate-limit")).toMatchObject({ status: "failed", error: { code: "RATE_LIMITED" } });
            await session.updateOptions({ model: "opus" });
            await session.send("hi", { requestId: "m" });
            expect(textOf(s.events, "m")).toContain("model opus");
        }
        catch (e_12) {
            env_12.error = e_12;
            env_12.hasError = true;
        }
        finally {
            const result_12 = __disposeResources(env_12);
            if (result_12)
                await result_12;
        }
    });
});
describe("claude: message interpretation", () => {
    it("ignores subagent output and maps the end of a turn", () => {
        expect(interpret({ type: "stream_event", parent_tool_use_id: "x", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "sub" } } })).toEqual([]);
        const aborted = interpret({ type: "result", subtype: "error_during_execution", is_error: true, errors: [], terminal_reason: "aborted_tools", usage: { input_tokens: 1, output_tokens: 2 }, total_cost_usd: 0 });
        expect(aborted.at(-1)).toEqual({ kind: "end", outcome: "cancelled" });
        const failed = interpret({ type: "result", subtype: "error_max_turns", is_error: true, errors: ["too many turns"], usage: { input_tokens: 1, output_tokens: 2 }, total_cost_usd: 0 });
        expect(failed.at(-1)).toMatchObject({ kind: "fail", error: { code: "PROVIDER_ERROR", meta: { providerCode: "error_max_turns" } } });
        expect(interpret({ type: "assistant", parent_tool_use_id: null, error: "authentication_failed" })).toMatchObject([{ kind: "error", error: { code: "ACCOUNT_EXPIRED" } }]);
        expect(interpret({ type: "rate_limit_event", rate_limit_info: { status: "allowed", utilization: 87 } })).toEqual([{ kind: "usage", usage: { limitUsed: 0.87, windows: [{ name: "limit", used: 0.87 }] } }]);
    });
    it("reads every window of a real rate-limit event, including one without top-level utilization", () => {
        // Captured from Claude Code 2.1.312 during the live checks (docs/compatibility.md).
        const real = { status: "allowed", resetsAt: 1793202600, rateLimitType: "five_hour", overageStatus: "rejected", isUsingOverage: false, unifiedWindows: { five_hour: { utilization: 0.35, resetsAt: 1793202600, status: "allowed" }, seven_day: { utilization: 0.68, resetsAt: 1793268000, status: "allowed" } } };
        expect(interpret({ type: "rate_limit_event", rate_limit_info: real })).toEqual([
            {
                kind: "usage",
                usage: {
                    limitUsed: 0.68,
                    limitResetsAt: "2026-10-29T10:00:00.000Z",
                    windows: [
                        { name: "five_hour", used: 0.35, resetsAt: "2026-10-28T15:50:00.000Z" },
                        { name: "seven_day", used: 0.68, resetsAt: "2026-10-29T10:00:00.000Z" },
                    ],
                },
            },
        ]);
    });
});
