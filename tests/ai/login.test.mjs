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
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./vitest-shim.mjs";
import { createAiRuntime, createClaudeProvider, createCodexProvider } from "../../src/ai/runtime/index.js";
import { pipeHost, tempDir } from "./helpers.mjs";
const FAKE_CLAUDE = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-claude.mjs", import.meta.url));
const FAKE_CODEX = fileURLToPath(new URL("../../src/ai/runtime/fixtures/fake-codex.mjs", import.meta.url));
async function claude(mode) {
    const ai = createAiRuntime({ appId: "test", dataDir: await tempDir(), providers: [createClaudeProvider({ executable: FAKE_CLAUDE, ...(mode ? { env: { FAKE_CLAUDE_LOGIN: mode } } : {}) })] });
    const account = await ai.createAccount({ providerId: "claude", label: "Work" });
    return { ai, account, [Symbol.asyncDispose]: () => ai.dispose() };
}
describe("sign-in without a working browser", () => {
    it("offers the address even when the browser finishes the sign-in", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_1, await claude(), true);
            const prompts = [];
            expect(await s.ai.connectAccount(s.account.id, { onLogin: (p) => prompts.push(p) })).toMatchObject({ state: "connected" });
            expect(prompts).toEqual([{ url: "https://claude.com/cai/oauth/authorize?code=true&client_id=fake-client&response_type=code&state=fake-state", acceptsCode: true }]);
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
    it("completes with the code the user pastes", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_2, await claude("code"), true);
            const status = await s.ai.connectAccount(s.account.id, { onLogin: () => setTimeout(() => s.ai.submitLoginCode(s.account.id, "  good-code  "), 20) });
            expect(status).toEqual({ state: "connected", identity: `${s.account.id}@example.org` });
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
    it("reports a wrong code as a failed sign-in", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_3, await claude("code"), true);
            const pending = s.ai.connectAccount(s.account.id, { onLogin: () => setTimeout(() => s.ai.submitLoginCode(s.account.id, "wrong"), 20) });
            await expect(pending).rejects.toMatchObject({ code: "LOGIN_FAILED", meta: { detail: expect.stringContaining("Invalid code") } });
            expect(await s.ai.accountStatus(s.account.id)).toEqual({ state: "disconnected" });
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
    it("refuses codes nobody is waiting for, and codes that are not one line", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_4, await claude("code"), true);
            expect(() => s.ai.submitLoginCode(s.account.id, "good-code")).toThrow(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
            let tried = false;
            const pending = s.ai.connectAccount(s.account.id, {
                onLogin: () => setTimeout(() => {
                    expect(() => s.ai.submitLoginCode(s.account.id, "good-code\nextra")).toThrow(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
                    expect(() => s.ai.submitLoginCode(s.account.id, "   ")).toThrow(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
                    tried = true;
                    s.ai.submitLoginCode(s.account.id, "good-code");
                }, 20),
            });
            expect(await pending).toMatchObject({ state: "connected" });
            expect(tried).toBe(true);
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
    it("cancels a sign-in that is waiting for a code", async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_5, await claude("code"), true);
            const controller = new AbortController();
            const pending = s.ai.connectAccount(s.account.id, { signal: controller.signal, onLogin: () => setTimeout(() => controller.abort(), 20) });
            await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
            // The account can sign in again afterwards.
            expect(() => s.ai.submitLoginCode(s.account.id, "good-code")).toThrow(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
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
    it("offers Codex's address without asking for a code", async () => {
        const ai = createAiRuntime({ appId: "test", dataDir: await tempDir(), providers: [createCodexProvider({ executable: FAKE_CODEX })] });
        try {
            const account = await ai.createAccount({ providerId: "codex" });
            const prompts = [];
            expect(await ai.connectAccount(account.id, { onLogin: (p) => prompts.push(p) })).toEqual({ state: "connected", identity: account.id });
            expect(prompts).toEqual([{ url: "https://auth.openai.com/oauth/authorize?response_type=code&client_id=fake-client&state=fake-state", acceptsCode: false }]);
        }
        finally {
            await ai.dispose();
        }
    });
    it("relays the address and the pasted code over the host protocol", async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const s = __addDisposableResource(env_6, await claude("code"), true);
            const input = new PassThrough();
            const output = new PassThrough();
            const host = pipeHost({ ai: s.ai, input, output });
            const lines = [];
            let answered;
            const result = new Promise((r) => (answered = r));
            createInterface({ input: output }).on("line", (line) => {
                const msg = JSON.parse(line);
                lines.push(msg);
                if (msg.login)
                    input.write(JSON.stringify({ id: 2, method: "accounts.submitCode", params: { accountId: msg.login.accountId, code: "good-code" } }) + "\n");
                if (msg.id === 1)
                    answered(msg);
            });
            input.write(JSON.stringify({ id: 1, method: "accounts.connect", params: { accountId: s.account.id } }) + "\n");
            expect((await result).result).toMatchObject({ state: "connected" });
            expect(lines.find((m) => m.login)).toEqual({ login: { requestId: 1, accountId: s.account.id, url: expect.stringContaining("/oauth/authorize"), acceptsCode: true } });
            expect(lines.find((m) => m.id === 2)).toEqual({ id: 2, result: null });
            input.end();
            await host.closed;
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
