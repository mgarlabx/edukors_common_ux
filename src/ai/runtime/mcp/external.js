import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { AiCliError } from "../errors.js";
import { buildEnv } from "../platform/env.js";
import { TOOL_SERVER_NAME } from "./toolServer.js";
import { VERSION } from "../version.js";
/**
 * The user's own MCP servers. The library connects to each one as a client
 * and offers its tools again, through the same channel as the application's
 * tools, so every call is authorized by the application and reported as
 * events, whichever provider runs the session. Providers are never handed the
 * server itself: a CLI in headless mode would call it unchecked.
 */
/** `timeout` is in milliseconds, as in Claude Code's `.mcp.json`. */
export const McpServerSpecSchema = z.union([
    z.object({
        type: z.literal("stdio").optional(),
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        timeout: z.number().positive().optional(),
    }),
    z.object({
        type: z.enum(["http", "sse"]),
        url: z.url({ protocol: /^https?$/ }),
        headers: z.record(z.string(), z.string()).optional(),
        timeout: z.number().positive().optional(),
    }),
]);
const SERVER_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 120_000;
/** Checks a set of server specs; a bad one is reported, never thrown. */
export function checkServers(raw) {
    const servers = {};
    const rejected = [];
    for (const [name, spec] of Object.entries(raw)) {
        if (!SERVER_NAME.test(name) || name === TOOL_SERVER_NAME) {
            rejected.push({ server: name, status: "failed", error: "invalid or reserved server name" });
            continue;
        }
        const parsed = McpServerSpecSchema.safeParse(spec);
        if (parsed.success)
            servers[name] = parsed.data;
        else
            rejected.push({ server: name, status: "failed", error: z.prettifyError(parsed.error).slice(0, 300) });
    }
    return { servers, rejected };
}
export class ExternalServers {
    log;
    connections = new Map();
    constructor(log) {
        this.log = log;
    }
    /** Connects to every server at once; each gets `CONNECT_TIMEOUT_MS`. */
    static async connect(raw, log) {
        const external = new ExternalServers(log);
        const { servers, rejected } = checkServers(raw);
        const statuses = await Promise.all(Object.entries(servers).map(([name, spec]) => external.open(name, spec)));
        return { servers: external, statuses: [...rejected, ...statuses] };
    }
    /** What providers are given: names and tools, no way to reach the servers. */
    list() {
        return [...this.connections.values()].map(({ name, tools }) => ({ name, tools }));
    }
    has(server, tool) {
        return Boolean(this.connections.get(server)?.tools.some((t) => t.name === tool));
    }
    async call(server, tool, args) {
        const connection = this.connections.get(server);
        if (!connection)
            throw new AiCliError("TOOL_NOT_FOUND", `the MCP server "${server}" is not connected`);
        const result = await connection.client.callTool({ name: tool, arguments: args }, undefined, { timeout: connection.timeoutMs });
        const parts = Array.isArray(result.content) ? result.content : [];
        const text = parts.map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type ?? "content"}]`)).join("\n");
        return { content: text || (result.structuredContent ? JSON.stringify(result.structuredContent) : ""), ...(result.isError ? { isError: true } : {}) };
    }
    async close() {
        const all = [...this.connections.values()];
        this.connections.clear();
        await Promise.all(all.map((c) => c.client.close().catch(() => undefined)));
    }
    async open(name, spec) {
        const client = new Client({ name: "edukors-ai-cli", version: VERSION });
        try {
            let transport;
            if (!("command" in spec)) {
                const requestInit = spec.headers ? { headers: spec.headers } : undefined;
                transport = spec.type === "sse" ? new SSEClientTransport(new URL(spec.url), { requestInit }) : new StreamableHTTPClientTransport(new URL(spec.url), { requestInit });
            }
            else {
                // The same restricted environment as provider processes, plus what the user configured.
                const stdio = new StdioClientTransport({ command: spec.command, args: spec.args ?? [], env: buildEnv({ set: spec.env ?? {} }), stderr: "pipe" });
                stdio.stderr?.on("data", (chunk) => this.log.debug(`mcp ${name}: ${String(chunk).trimEnd().slice(0, 300)}`));
                transport = stdio;
            }
            const tools = await withTimeout((async () => {
                await client.connect(transport);
                const found = [];
                let cursor;
                do {
                    const page = await client.listTools(cursor ? { cursor } : {});
                    for (const t of page.tools)
                        found.push({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema });
                    cursor = page.nextCursor;
                } while (cursor);
                return found;
            })(), CONNECT_TIMEOUT_MS);
            this.connections.set(name, { name, client, tools, timeoutMs: spec.timeout ?? CALL_TIMEOUT_MS });
            this.log.info(`mcp ${name} connected`, { tools: tools.length });
            return { server: name, status: "connected", tools: tools.length };
        }
        catch (e) {
            await client.close().catch(() => undefined);
            const error = e instanceof Error ? e.message : String(e);
            this.log.warn(`mcp ${name} failed`, { error });
            return { server: name, status: "failed", error: error.slice(0, 300) };
        }
    }
}
function withTimeout(work, ms) {
    let timer;
    return Promise.race([work, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("did not connect in time")), ms)))]).finally(() => clearTimeout(timer));
}
