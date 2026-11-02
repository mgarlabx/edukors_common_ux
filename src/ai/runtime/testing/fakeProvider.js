import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AiError } from "../errors.js";
import { buildEnv } from "../platform/env.js";
import { compareVersions } from "../platform/discovery.js";
import { ManagedProcess, readLines, runCommand } from "../platform/process.js";
/**
 * An adapter for fixtures/fake-ai.mjs. It is written the way a real adapter
 * is: detection, sign-in and status through short commands, a long-running
 * process for the session, runtime validation of everything it reads.
 * Applications can use it to test their integration without any account.
 */
export const FAKE_CLI_PATH = fileURLToPath(new URL("../fixtures/fake-ai.mjs", import.meta.url));
const Incoming = z.discriminatedUnion("type", [
    z.object({ type: z.literal("ready"), sessionId: z.string(), resumed: z.boolean(), user: z.string(), turns: z.number() }),
    z.object({ type: z.literal("fatal"), code: z.string(), message: z.string() }),
    z.object({ type: z.literal("text"), turnId: z.string(), delta: z.string() }),
    z.object({ type: z.literal("activity"), turnId: z.string(), phase: z.enum(["thinking", "reading", "researching", "applying"]) }),
    z.object({ type: z.literal("tool_call"), turnId: z.string(), callId: z.string(), name: z.string(), args: z.unknown() }),
    z.object({ type: z.literal("mcp_call"), turnId: z.string(), callId: z.string(), server: z.string(), name: z.string(), args: z.unknown() }),
    // Common: a native action (creating or editing a file) put to the application before it happens.
    z.object({ type: z.literal("native"), turnId: z.string(), callId: z.string(), action: z.string(), path: z.string(), relativePath: z.string() }),
    z.object({ type: z.literal("question"), turnId: z.string(), questionId: z.string(), prompt: z.string(), options: z.array(z.string()).optional() }),
    z.object({ type: z.literal("usage"), turnId: z.string(), inputTokens: z.number(), outputTokens: z.number() }),
    z.object({ type: z.literal("done"), turnId: z.string() }),
    z.object({ type: z.literal("cancelled"), turnId: z.string() }),
    z.object({ type: z.literal("error"), turnId: z.string().optional(), code: z.string(), message: z.string() }),
]);
const StatusOutput = z.object({ signedIn: z.boolean(), user: z.string().optional(), expired: z.boolean().optional() });
const ModelsOutput = z.object({ models: z.array(z.object({ id: z.string(), label: z.string().optional(), efforts: z.array(z.string()).optional(), default: z.boolean().optional() })) });
function parseJson(schema, text, what) {
    const line = text.trim().split("\n").filter(Boolean).pop() ?? "";
    let value;
    try {
        value = JSON.parse(line);
    }
    catch (e) {
        throw new AiError("PROVIDER_PROTOCOL", `${what}: output is not JSON`, { cause: e });
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success)
        throw new AiError("PROVIDER_PROTOCOL", `${what}: unexpected output`, { meta: { issue: z.prettifyError(parsed.error) } });
    return parsed.data;
}
const errorFromProvider = (code, message) => code === "rate_limited"
    ? new AiError("RATE_LIMITED", message)
    : code === "auth"
        ? new AiError("ACCOUNT_DISCONNECTED", message)
        : code === "expired"
            ? new AiError("ACCOUNT_EXPIRED", message)
            : new AiError("PROVIDER_ERROR", message, { meta: { providerCode: code } });
export function createFakeProvider(options = {}) {
    const id = options.id ?? "fake";
    const command = options.command ?? { file: process.execPath, args: [FAKE_CLI_PATH] };
    const minVersion = options.minVersion ?? "1.0.0";
    const env = (context) => buildEnv({ set: { ...options.env, ...(context ? { FAKE_AI_HOME: context.homeDir } : {}) } });
    const run = (context, args, timeoutMs = 15_000) => runCommand({ file: command.file, args: [...command.args, ...args], env: env(context), timeoutMs, ...(context.signal ? { signal: context.signal } : {}) });
    const capabilities = {
        login: "browser",
        accountStatus: true,
        multiAccount: options.multiAccount ?? true,
        logout: true,
        persistentSessions: true,
        models: true,
        efforts: true,
        usage: false,
        tools: true,
        questions: true,
        liveOptions: true,
        workspace: true,
        workspaceShell: options.workspaceShell ?? true,
    };
    return {
        id,
        displayName: "Fake AI",
        installUrl: "https://example.invalid/fake-ai",
        async detect() {
            const result = await runCommand({ file: command.file, args: [...command.args, "--version"], env: env(), timeoutMs: 10_000 }).catch(() => null);
            if (!result || result.code !== 0)
                return { providerId: id, status: "missing" };
            const version = result.stdout.match(/\d+\.\d+\.\d+/)?.[0];
            if (!version)
                return { providerId: id, status: "error", executable: command.file, detail: "unrecognized version output" };
            if (compareVersions(version, minVersion) < 0)
                return { providerId: id, status: "incompatible", executable: command.file, version, requiredVersion: minVersion };
            return { providerId: id, status: "ready", executable: command.file, version };
        },
        capabilities: () => capabilities,
        async connectAccount(context) {
            const result = await run(context, ["login", "--label", context.label], 120_000);
            if (result.timedOut)
                throw new AiError("TIMEOUT", "sign-in did not finish in time");
            if (result.code !== 0)
                throw new AiError("LOGIN_FAILED", "sign-in failed", { meta: { detail: result.stderr.trim().slice(0, 300) } });
            return this.accountStatus(context);
        },
        async accountStatus(context) {
            const result = await run(context, ["status"]);
            if (result.code !== 0)
                throw new AiError("PROVIDER_ERROR", "status check failed", { meta: { detail: result.stderr.trim().slice(0, 300) } });
            const status = parseJson(StatusOutput, result.stdout, "status");
            if (!status.signedIn)
                return { state: "disconnected" };
            return { state: status.expired ? "expired" : "connected", ...(status.user ? { identity: status.user } : {}) };
        },
        async logout(context) {
            const result = await run(context, ["logout"]);
            if (result.code !== 0)
                throw new AiError("PROVIDER_ERROR", "sign-out failed");
        },
        async listModels(context) {
            const result = await run(context, ["models"]);
            if (result.code !== 0)
                throw new AiError("PROVIDER_ERROR", "could not list models");
            return parseJson(ModelsOutput, result.stdout, "models").models;
        },
        openSession: (context, hooks) => FakeSession.open(command, env(context), context, hooks, options.startupTimeoutMs ?? 10_000),
    };
}
class FakeSession {
    proc;
    log;
    hooks;
    resumeId;
    pending = null;
    /**
     * Sinks of recent turns, kept after they end: output that arrives late is
     * still delivered to its sink, which the library then drops. The adapter
     * does not have to get this right for the document to be safe.
     */
    sinks = new Map();
    closing = false;
    constructor(proc, log, hooks) {
        this.proc = proc;
        this.log = log;
        this.hooks = hooks;
    }
    static async open(command, env, context, hooks, startupTimeoutMs) {
        const args = [...command.args, "serve", ...(context.resumeId ? ["--resume", context.resumeId] : [])];
        const proc = new ManagedProcess({ file: command.file, args, env, cwd: context.workspace?.dir ?? context.workDir });
        const session = new FakeSession(proc, context.log, hooks);
        const ready = new Promise((resolve, reject) => {
            session.onStartup = (msg) => {
                if (msg.type === "ready")
                    resolve(msg.sessionId);
                else if (msg.type === "fatal")
                    reject(errorFromProvider(msg.code, msg.message));
            };
            void proc.exited.then((info) => reject(new AiError("PROVIDER_START_FAILED", "the provider exited during startup", { meta: { code: info.code, stderr: proc.stderr.toString().slice(-300) } })));
            setTimeout(() => reject(new AiError("TIMEOUT", "the provider did not start in time")), startupTimeoutMs).unref();
        });
        readLines(proc.child.stdout, (line) => session.onLine(line), { onOverflow: () => context.log.warn("discarded an oversized line") });
        void proc.exited.then((info) => session.onExit(info.code, info.signal));
        try {
            session.resumeId = await ready;
        }
        catch (e) {
            session.closing = true;
            await proc.terminate(500);
            throw e;
        }
        session.onStartup = null;
        proc.writeLine({
            type: "init",
            instructions: context.instructions,
            tools: context.tools,
            model: context.options.model,
            effort: context.options.effort,
            ...(context.workspace ? { workspace: context.workspace } : {}),
        });
        return session;
    }
    onStartup = null;
    send(input, sink) {
        if (this.pending)
            return Promise.reject(new AiError("SESSION_BUSY", "a turn is already running"));
        const turnId = input.requestId;
        this.sinks.set(turnId, sink);
        if (this.sinks.size > 8)
            this.sinks.delete(this.sinks.keys().next().value);
        return new Promise((resolve, reject) => {
            this.pending = { turnId, resolve, reject };
            const text = input.context ? `${input.text}\n\n<document>\n${input.context}\n</document>` : input.text;
            if (!this.proc.writeLine({ type: "turn", turnId, text })) {
                this.pending = null;
                reject(new AiError("PROVIDER_CRASHED", "the provider is not running"));
            }
        });
    }
    async interrupt() {
        if (this.pending)
            this.proc.writeLine({ type: "interrupt", turnId: this.pending.turnId });
    }
    async updateOptions(options) {
        this.proc.writeLine({ type: "options", model: options.model, effort: options.effort });
    }
    async close() {
        if (this.closing)
            return;
        this.closing = true;
        this.proc.writeLine({ type: "exit" });
        await this.proc.terminate(1_000);
        this.settle((p) => p.reject(new AiError("SESSION_CLOSED", "the session was closed")));
    }
    settle(fn) {
        const pending = this.pending;
        this.pending = null;
        if (pending)
            fn(pending);
    }
    onLine(line) {
        if (!line.trim())
            return;
        let raw;
        try {
            raw = JSON.parse(line);
        }
        catch {
            this.log.warn("ignored a line that is not JSON", { line: line.slice(0, 200) });
            return;
        }
        const parsed = Incoming.safeParse(raw);
        if (!parsed.success) {
            this.log.warn("ignored an unexpected message", { issue: z.prettifyError(parsed.error) });
            return;
        }
        const msg = parsed.data;
        if (this.onStartup)
            return this.onStartup(msg);
        if (msg.type === "ready" || msg.type === "fatal")
            return;
        const sink = msg.turnId ? this.sinks.get(msg.turnId) : undefined;
        if (!sink) {
            this.log.debug("output for an unknown turn", { type: msg.type });
            return;
        }
        const isCurrent = this.pending?.turnId === msg.turnId;
        switch (msg.type) {
            case "text":
                return sink.text(msg.delta);
            case "activity":
                return sink.activity(msg.phase);
            case "usage":
                return sink.usage({ inputTokens: msg.inputTokens, outputTokens: msg.outputTokens });
            case "tool_call":
                void sink.callTool(msg.name, msg.args).then((result) => this.proc.writeLine({ type: "tool_result", callId: msg.callId, ...result }));
                return;
            case "mcp_call":
                void sink.callExternal(msg.server, msg.name, msg.args).then((result) => this.proc.writeLine({ type: "tool_result", callId: msg.callId, ...result }));
                return;
            case "native":
                void (sink.authorizeNative ? sink.authorizeNative({ action: msg.action, tool: "write", path: msg.path, relativePath: msg.relativePath }) : Promise.resolve({ allow: true }))
                    .then((decision) => this.proc.writeLine({ type: "tool_result", callId: msg.callId, content: decision.allow ? "allowed" : decision.message || "declined", ...(decision.allow ? {} : { isError: true }) }));
                return;
            case "question":
                sink.ask({ prompt: msg.prompt, ...(msg.options ? { options: msg.options } : {}) }).then((answer) => this.proc.writeLine({ type: "answer", questionId: msg.questionId, answer }), () => undefined);
                return;
            case "done":
                if (isCurrent)
                    this.settle((p) => p.resolve("completed"));
                return;
            case "cancelled":
                if (isCurrent)
                    this.settle((p) => p.resolve("cancelled"));
                return;
            case "error":
                if (isCurrent)
                    this.settle((p) => p.reject(errorFromProvider(msg.code, msg.message)));
                return;
        }
    }
    onExit(code, signal) {
        // During startup, `open` reports the failure itself.
        if (this.closing || this.onStartup)
            return;
        const error = new AiError("PROVIDER_CRASHED", "the provider stopped unexpectedly", { meta: { code, signal, stderr: this.proc.stderr.toString().slice(-300) } });
        this.hooks.exited(error);
        this.settle((p) => p.reject(error));
    }
}
