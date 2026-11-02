import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "./vitest-shim.mjs";
import { createAiCli } from "../../src/ai/runtime/index.js";
import { createFakeProvider } from "../../src/ai/runtime/testing/index.js";
const cleanup = [];
const folders = [];
// Providers first: on Windows a folder in use by a process cannot be removed.
afterEach(async () => {
    while (cleanup.length)
        await cleanup.pop()();
    while (folders.length)
        await rm(folders.pop(), { recursive: true, force: true, maxRetries: 10 });
});
/** A temporary data directory, with a space and non-ASCII characters in its path. */
export async function tempDir() {
    const dir = await mkdtemp(join(tmpdir(), "edukors ai ção-"));
    folders.push(dir);
    return dir;
}
export async function setup(options = {}) {
    const dataDir = options.ai?.dataDir ?? (await tempDir());
    const ai = createAiCli({ appId: "test", providers: [createFakeProvider(options.fake)], dataDir, interruptGraceMs: 400, ...options.ai });
    cleanup.push(() => ai.dispose());
    const events = [];
    ai.onEvent((e) => events.push(e));
    return { ai, dataDir, events };
}
/** An account of the fake provider, signed in. */
export async function connectedAccount(ai, label = "Personal") {
    const account = await ai.createAccount({ providerId: "fake", label });
    await ai.connectAccount(account.id);
    return account;
}
export const textOf = (events, requestId) => events
    .filter((e) => e.type === "textDelta" && (!requestId || e.requestId === requestId))
    .map((e) => e.text)
    .join("");
export const types = (events, requestId) => events.filter((e) => !requestId || e.requestId === requestId).map((e) => e.type);
export async function until(check, timeoutMs = 5_000) {
    const end = Date.now() + timeoutMs;
    while (!check()) {
        if (Date.now() > end)
            throw new Error("condition not met in time");
        await new Promise((r) => setTimeout(r, 10));
    }
}
