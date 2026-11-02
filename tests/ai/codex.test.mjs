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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./vitest-shim.mjs";
import { z } from "zod";
import { createAiRuntime, createCodexProvider, defineTool, Diagnostics, startToolBridge } from "../../src/ai/runtime/index.js";
import { codexError, codexLimits } from "../../src/ai/runtime/providers/codex/adapter.js";
import { tempDir, textOf, until } from "./helpers.mjs";
const FAKE_CODEX = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-codex.mjs", import.meta.url));
async function setup(options = {}) {
    const ai = createAiRuntime({ appId: "slides", dataDir: await tempDir(), interruptGraceMs: 400, providers: [createCodexProvider({ executable: FAKE_CODEX, ...options })] });
    const events = [];
    ai.onEvent((e) => events.push(e));
    const connected = async (label = "Personal") => {
        const account = await ai.createAccount({ providerId: "codex", label });
        await ai.connectAccount(account.id);
        return account;
    };
    return { ai, events, connected, [Symbol.asyncDispose]: () => ai.dispose() };
}
describe("codex: installation and accounts", () => {
    it("detects the CLI and refuses versions older than the verified one", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_1, await setup(), true);
            expect(await s.ai.detect("codex")).toMatchObject({ status: "ready", version: "0.164.0" });
            const old = __addDisposableResource(env_1, await setup({ env: { FAKE_CODEX_VERSION: "0.150.2" } }), true);
            expect(await old.ai.detect("codex")).toMatchObject({ status: "incompatible", version: "0.150.2", requiredVersion: "0.164.0" });
            const account = await old.ai.createAccount({ providerId: "codex" });
            await expect(old.ai.openSession({ accountId: account.id, documentId: "d" })).rejects.toMatchObject({ code: "CLI_INCOMPATIBLE" });
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
    it("keeps each account's sign-in in its own home, never the user's", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_2, await setup(), true);
            const personal = await s.ai.createAccount({ providerId: "codex", label: "Personal" });
            const work = await s.ai.createAccount({ providerId: "codex", label: "Work" });
            expect(await s.ai.accountStatus(personal.id)).toEqual({ state: "disconnected" });
            expect(await s.ai.connectAccount(personal.id)).toEqual({ state: "connected", identity: personal.id });
            expect(await s.ai.accountStatus(work.id)).toEqual({ state: "disconnected" });
            expect(existsSync(join(personal.homeDir, "auth.json"))).toBe(true);
            expect(existsSync(join(work.homeDir, "auth.json"))).toBe(false);
            await s.ai.logoutAccount(personal.id);
            expect(await s.ai.accountStatus(personal.id)).toEqual({ state: "disconnected" });
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
    it("reports a failed sign-in", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_3, await setup({ env: { FAKE_CODEX_LOGIN: "fail" } }), true);
            const account = await s.ai.createAccount({ providerId: "codex" });
            await expect(s.ai.connectAccount(account.id)).rejects.toMatchObject({ code: "LOGIN_FAILED", meta: { detail: "login cancelled" } });
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
    it("lists models and reads the account's usage limits", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_4, await setup(), true);
            const account = await s.connected();
            expect(await s.ai.listModels(account.id)).toEqual([{ id: "gpt-fake", label: "GPT Fake", efforts: ["low", "high"], default: true }]);
            expect(await s.ai.readUsage(account.id)).toMatchObject({
                limitUsed: 0.42,
                limitResetsAt: "2033-05-18T03:33:20.000Z",
                windows: [{ name: "five_hour", used: 0.42 }, { name: "seven_day", used: 0.1 }],
                observedAt: expect.any(String),
            });
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
    it("refuses to open a session on a signed-out account", async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_5, await setup(), true);
            const account = await s.ai.createAccount({ providerId: "codex" });
            await expect(s.ai.openSession({ accountId: account.id, documentId: "d" })).rejects.toMatchObject({ code: "ACCOUNT_DISCONNECTED" });
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
});
describe("codex: sessions", () => {
    it("runs a request read-only, with the editor's instructions and options", async () => {
        process.env.OPENAI_API_KEY = "sk-should-not-leak-000000000000";
        try {
            const env_6 = { stack: [], error: void 0, hasError: false };
            try {
                const s = __addDisposableResource(env_6, await setup(), true);
                const account = await s.connected();
                const session = await s.ai.openSession({ accountId: account.id, documentId: "deck", instructions: "Edit slides.", options: { model: "gpt-fake" } });
                expect(await session.send("hello", { requestId: "r" })).toEqual({ requestId: "r", status: "completed" });
                expect(textOf(s.events, "r")).toBe("Echo: hello [history 0, model gpt-fake, effort default, mcp off, instructions Edit slides.]");
                expect(s.events.find((e) => e.type === "usageUpdated" && e.requestId === "r")).toMatchObject({ usage: { inputTokens: 5 } });
                await session.updateOptions({ effort: "high" });
                await session.send("env", { requestId: "e" });
                expect(textOf(s.events, "e")).toBe(`OPENAI_API_KEY=absent home=${account.id} sandbox=read-only approval=untrusted`);
                // Codex's own skills were switched off in the account's home, not the user's.
                expect(JSON.parse(readFileSync(join(account.homeDir, "skill-switches.json"), "utf8"))).toEqual({ "/bundled/imagegen/SKILL.md": false });
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
        }
        finally {
            delete process.env.OPENAI_API_KEY;
        }
    });
    it("calls the application's tools over the authenticated local bridge", async () => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_7, await setup(), true);
            const account = await s.connected();
            const applied = [];
            const tool = defineTool({ name: "add_slide", description: "Adds a slide.", input: z.object({ title: z.string() }), run: ({ title }) => (applied.push(title), { content: "added" }) });
            const session = await s.ai.openSession({ accountId: account.id, documentId: "deck", tools: [tool] });
            await session.send('tool add_slide {"title":"Introdução"}', { requestId: "t" });
            await session.send('tool add_slide {"title":7}', { requestId: "bad" });
            expect(applied).toEqual(["Introdução"]);
            expect(textOf(s.events, "t")).toBe("Tool add_slide said: added");
            expect(textOf(s.events, "bad")).toContain("Invalid arguments for add_slide");
            expect(s.events.filter((e) => e.requestId === "t").map((e) => e.type)).toContain("toolCompleted");
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
    it("asks the user, and declines commands", async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_8, await setup(), true);
            const account = await s.connected();
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d" });
            session.on((e) => e.type === "question" && session.answer(e.questionId, "red"));
            await session.send("ask", { requestId: "q" });
            expect(textOf(s.events, "q")).toBe("You chose red");
            expect(s.events.find((e) => e.type === "question" && e.requestId === "q")).toMatchObject({ prompt: "Which color?", options: ["red", "blue"] });
            await session.send("ask-blocking", { requestId: "qb" });
            expect(textOf(s.events, "qb")).toBe("You chose red");
            await session.send("comando", { requestId: "c" });
            expect(textOf(s.events, "c")).toBe("Command decline");
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
    it("interrupts a turn that is waiting for the user's answer", async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_9, await setup(), true);
            const account = await s.connected();
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d" });
            const pending = session.send("ask", { requestId: "q" });
            await until(() => s.events.some((e) => e.type === "question"));
            await session.interrupt();
            expect(await pending).toEqual({ requestId: "q", status: "cancelled" });
            expect((await session.send("after", { requestId: "n" })).status).toBe("completed");
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
            await until(() => session.lateEventsDropped > 0);
            expect(textOf(s.events)).not.toContain("LATE");
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
    it("recovers from a crash by resuming the thread", async () => {
        const env_11 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_11, await setup(), true);
            const account = await s.connected();
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d" });
            await session.send("one", { requestId: "a" });
            const thread = session.resumeId;
            expect(await session.send("crash")).toMatchObject({ status: "failed", error: { code: "PROVIDER_CRASHED" } });
            await session.send("two", { requestId: "b" });
            expect(session.resumeId).toBe(thread);
            expect(textOf(s.events, "b")).toContain("[history 1,");
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
    it("maps a usage limit to RATE_LIMITED", async () => {
        const env_12 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_12, await setup(), true);
            const account = await s.connected();
            const session = await s.ai.openSession({ accountId: account.id, documentId: "d" });
            expect(await session.send("limit")).toMatchObject({ status: "failed", error: { code: "RATE_LIMITED" } });
            expect((await session.send("after")).status).toBe("completed");
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
    it("runs two documents on one account at once without sharing state", async () => {
        const env_13 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_13, await setup(), true);
            const account = await s.connected();
            const tool = (name) => defineTool({ name: "whoami", description: "", input: z.object({}), run: () => ({ content: name }) });
            const a = await s.ai.openSession({ accountId: account.id, documentId: "a", tools: [tool("A")] });
            const b = await s.ai.openSession({ accountId: account.id, documentId: "b", tools: [tool("B")] });
            await Promise.all([a.send("tool whoami", { requestId: "ra" }), b.send("tool whoami", { requestId: "rb" })]);
            expect(textOf(s.events, "ra")).toBe("Tool whoami said: A");
            expect(textOf(s.events, "rb")).toBe("Tool whoami said: B");
            expect(a.resumeId).not.toBe(b.resumeId);
            expect(existsSync(join(account.homeDir, "config.toml"))).toBe(false);
        }
        catch (e_13) {
            env_13.error = e_13;
            env_13.hasError = true;
        }
        finally {
            const result_13 = __disposeResources(env_13);
            if (result_13)
                await result_13;
        }
    });
});
describe("codex: protocol mapping", () => {
    it("takes the most used window as the account's limit", () => {
        expect(codexLimits({ rateLimitsByLimitId: { a: { limitId: "a", primary: { usedPercent: 20, windowDurationMins: 300 } }, b: { limitId: "b", secondary: { usedPercent: 75, resetsAt: 1, windowDurationMins: 10080 } } } })).toEqual({
            limitUsed: 0.75,
            limitResetsAt: "1970-01-01T00:00:01.000Z",
            windows: [
                { name: "a:five_hour", used: 0.2 },
                { name: "b:seven_day", used: 0.75, resetsAt: "1970-01-01T00:00:01.000Z" },
            ],
        });
        expect(codexLimits({})).toBeNull();
        expect(codexError({ codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 502 } } })).toMatchObject({ code: "PROVIDER_ERROR", retryable: true });
        expect(codexError({ codexErrorInfo: "unauthorized" })).toMatchObject({ code: "ACCOUNT_EXPIRED" });
    });
});
describe("tool bridge", () => {
    it("binds to 127.0.0.1 and refuses requests without its token", async () => {
        const bridge = await startToolBridge([{ name: "edukors", tools: [], call: async () => ({ content: "" }) }], new Diagnostics().scoped("t"));
        try {
            expect(new URL(bridge.url).hostname).toBe("127.0.0.1");
            expect((await fetch(bridge.url, { method: "POST", body: "{}" })).status).toBe(401);
            expect((await fetch(bridge.url, { method: "POST", body: "{}", headers: { authorization: "Bearer wrong" } })).status).toBe(401);
            const list = await fetch(bridge.url, {
                method: "POST",
                headers: { authorization: `Bearer ${bridge.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
            });
            expect(list.status).toBe(200);
        }
        finally {
            await bridge.close();
        }
    });
});
