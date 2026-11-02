import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "./vitest-shim.mjs";
import { createAiRuntime } from "../../src/ai/runtime/index.js";
import { createFakeProvider } from "../../src/ai/runtime/testing/index.js";
import { createHostDispatcher } from "../../src/ai/runtime/host/dispatcher.js";
import { readLines } from "../../src/ai/runtime/platform/process.js";
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
    const ai = createAiRuntime({ appId: "test", providers: [createFakeProvider(options.fake)], dataDir, interruptGraceMs: 400, ...options.ai });
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

/**
 * The host protocol over a pair of streams, one JSON object per line, as a test plays the application's side of it:
 * lines written to `input` reach the dispatcher, its messages come out of `output`. Invalid lines are ignored; ending
 * `input` closes the dispatcher (`closed`).
 */
export function pipeHost({ ai, input, output, toolTimeoutMs = 120_000, methods }) {
    const dispatcher = createHostDispatcher({ ai, toolTimeoutMs, methods, send: (msg) => output.write(JSON.stringify(msg) + "\n") });
    readLines(input, (line) => {
        if (!line.trim())
            return;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            return;
        }
        dispatcher.receive(parsed);
    });
    const closed = new Promise((resolve) => {
        input.on("end", () => void dispatcher.close().then(resolve));
    });
    return { closed };
}
