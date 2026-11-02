import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
/**
 * A stand-in for the Agent SDK's `query()`: the same streaming-input shape,
 * messages and control methods the adapter uses. Sign-in is read from the
 * CLAUDE_CONFIG_DIR the adapter passes, as fixtures/fake-claude.mjs writes it;
 * the application's tools are called through the in-process MCP server the
 * adapter registers; AskUserQuestion and Bash go through `canUseTool`.
 *
 * A turn: "tool <name> [<json>]", "ask", "bash", "slow", "late", "crash",
 * "rate-limit", anything else echoes.
 */
class Channel {
    items = [];
    waiters = [];
    done = false;
    error = null;
    push(item) {
        if (this.done)
            return;
        const w = this.waiters.shift();
        if (w)
            w.resolve({ value: item, done: false });
        else
            this.items.push(item);
    }
    close() {
        this.done = true;
        for (const w of this.waiters.splice(0))
            w.resolve({ value: undefined, done: true });
    }
    fail(error) {
        this.error = error;
        this.done = true;
        for (const w of this.waiters.splice(0))
            w.reject(error);
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => {
                if (this.items.length)
                    return Promise.resolve({ value: this.items.shift(), done: false });
                if (this.error)
                    return Promise.reject(this.error);
                if (this.done)
                    return Promise.resolve({ value: undefined, done: true });
                return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
            },
        };
    }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function fakeClaudeSdk() {
    const calls = [];
    /** Turns per conversation, across processes: what `resume` restores. */
    const histories = new Map();
    const sdk = {
        query({ prompt, options = {} }) {
            calls.push(options);
            return makeQuery(prompt, options, histories);
        },
    };
    return { sdk, calls, loadSdk: async () => sdk };
}
function makeQuery(prompt, options, histories) {
    const dir = options.env?.CLAUDE_CONFIG_DIR ?? "";
    const authFile = join(dir, "fake-auth.json");
    const signed = existsSync(authFile) ? JSON.parse(readFileSync(authFile, "utf8")) : null;
    const sessionId = options.resume ?? options.sessionId ?? randomUUID();
    const out = new Channel();
    let model = options.model ?? "default";
    let interrupted = false;
    const base = { session_id: sessionId, uuid: randomUUID() };
    const emit = (msg) => out.push({ ...base, ...msg });
    const delta = (text) => emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } });
    const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 };
    const result = (extra = {}) => emit({ type: "result", subtype: "success", is_error: false, result: "", usage, total_cost_usd: 0.01, ...extra });
    const signal = new AbortController().signal;
    const clients = new Map();
    async function callTool(name, args, serverName = "edukors") {
        let client = clients.get(serverName);
        if (!client) {
            const server = options.mcpServers?.[serverName]?.instance;
            if (!server)
                return `no MCP server ${serverName}`;
            const [a, b] = InMemoryTransport.createLinkedPair();
            await server.connect(b);
            client = new Client({ name: "fake-claude", version: "1.0.0" });
            await client.connect(a);
            clients.set(serverName, client);
        }
        const r = await client.callTool({ name, arguments: args });
        const text = r.content.map((c) => c.text ?? "").join("\n");
        return `${text}${r.isError ? " (error)" : ""}`;
    }
    async function turn(text) {
        interrupted = false;
        emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } } });
        let answer;
        const tool = /\btool (\w+)(?: (\{.*\}))?/.exec(text);
        const mcp = /\bmcp ([\w-]+) (\w+)(?: (\{.*\}))?/.exec(text);
        if (/crash/.test(text)) {
            delta("about to crash");
            await sleep(10);
            throw new Error("Claude Code process exited with code 1");
        }
        else if (/rate-limit/.test(text)) {
            emit({ type: "assistant", parent_tool_use_id: null, error: "rate_limit", message: { content: [] } });
            return result({ subtype: "error_during_execution", is_error: true, errors: ["rate limited"] });
        }
        else if (/slow|late/.test(text)) {
            for (let i = 0; i < 40; i++) {
                if (interrupted) {
                    result({ subtype: "error_during_execution", is_error: true, errors: [], terminal_reason: "aborted_streaming" });
                    if (/late/.test(text)) {
                        await sleep(30);
                        delta("LATE OUTPUT");
                    }
                    return;
                }
                delta(".");
                await sleep(50);
            }
            answer = "done slowly";
        }
        else if (mcp) {
            const name = `mcp__${mcp[1]}__${mcp[2]}`;
            const allowed = (await options.canUseTool(name, {}, { signal }))?.behavior === "allow";
            answer = allowed ? `${mcp[1]}.${mcp[2]} said: ${await callTool(mcp[2], mcp[3] ? JSON.parse(mcp[3]) : {}, mcp[1])}` : `${name} denied`;
        }
        else if (tool) {
            emit({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t1", name: `mcp__edukors__${tool[1]}`, input: {} } } });
            // Like Claude Code: a tool not pre-approved by allowedTools is put to canUseTool first.
            const name = `mcp__edukors__${tool[1]}`;
            const allowed = options.allowedTools?.some((rule) => rule === name || rule === "mcp__edukors") || (await options.canUseTool(name, {}, { signal }))?.behavior === "allow";
            answer = allowed ? `Tool ${tool[1]} said: ${await callTool(tool[1], tool[2] ? JSON.parse(tool[2]) : {})}` : `Tool ${tool[1]} denied`;
        }
        else if (/\bask\b/.test(text)) {
            const r = await options.canUseTool("AskUserQuestion", { questions: [{ question: "Which color?", header: "Color", options: [{ label: "red" }, { label: "blue" }], multiSelect: false }] }, { signal });
            answer = r.behavior === "allow" ? `You chose ${(r.updatedInput?.answers)["Which color?"]}` : `Question denied: ${r.message}`;
        }
        else if (/\bbash\b/.test(text)) {
            const r = await options.canUseTool("Bash", { command: "ls" }, { signal });
            answer = `Bash ${r.behavior}`;
        }
        else {
            answer = `Echo: ${text} [history ${histories.get(sessionId) ?? 0}, model ${model}]`;
        }
        for (const piece of [answer.slice(0, 8), answer.slice(8)])
            if (piece)
                delta(piece);
        histories.set(sessionId, (histories.get(sessionId) ?? 0) + 1);
        emit({ type: "rate_limit_event", rate_limit_info: { status: "allowed", utilization: 0.42, rateLimitType: "five_hour", resetsAt: 2000000000 } });
        result();
    }
    void (async () => {
        emit({ type: "system", subtype: "init", model, tools: options.tools, mcp_servers: [] });
        for await (const user of prompt) {
            const content = user.message.content;
            await turn(typeof content === "string" ? content : "");
        }
        out.close();
    })().catch((e) => out.fail(e));
    const query = {
        [Symbol.asyncIterator]: () => out[Symbol.asyncIterator](),
        initializationResult: async () => ({
            commands: [],
            agents: [],
            output_style: "default",
            available_output_styles: [],
            models: [
                { value: "default", displayName: "Default (recommended)", description: "" },
                { value: "opus", displayName: "Opus", description: "", supportedEffortLevels: ["low", "high", "max"] },
            ],
            account: signed ? { email: signed.email, subscriptionType: "max", tokenSource: "claude.ai" } : { tokenSource: "none", apiProvider: "firstParty" },
        }),
        interrupt: async () => {
            interrupted = true;
            return undefined;
        },
        setModel: async (m) => {
            model = m ?? "default";
        },
        applyFlagSettings: async () => undefined,
        close: () => out.close(),
    };
    return query;
}
