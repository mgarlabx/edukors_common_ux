import { z } from "zod";
import type { ScopedLog } from "../diagnostics.js";
import type { ExternalServer } from "../provider.js";
import type { ToolResult } from "../tools.js";
/**
 * The user's own MCP servers. The library connects to each one as a client
 * and offers its tools again, through the same channel as the application's
 * tools, so every call is authorized by the application and reported as
 * events, whichever provider runs the session. Providers are never handed the
 * server itself: a CLI in headless mode would call it unchecked.
 */
/** `timeout` is in milliseconds, as in Claude Code's `.mcp.json`. */
export declare const McpServerSpecSchema: z.ZodUnion<readonly [z.ZodObject<{
    type: z.ZodOptional<z.ZodLiteral<"stdio">>;
    command: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString>>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodEnum<{
        http: "http";
        sse: "sse";
    }>;
    url: z.ZodURL;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    timeout: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>]>;
export type McpServerSpec = z.infer<typeof McpServerSpecSchema>;
export interface ExternalStatus {
    server: string;
    status: "connected" | "failed";
    tools?: number;
    error?: string;
}
/** Checks a set of server specs; a bad one is reported, never thrown. */
export declare function checkServers(raw: Record<string, unknown>): {
    servers: Record<string, McpServerSpec>;
    rejected: ExternalStatus[];
};
export declare class ExternalServers {
    private readonly log;
    private readonly connections;
    private constructor();
    /** Connects to every server at once; each gets `CONNECT_TIMEOUT_MS`. */
    static connect(raw: Record<string, unknown>, log: ScopedLog): Promise<{
        servers: ExternalServers;
        statuses: ExternalStatus[];
    }>;
    /** What providers are given: names and tools, no way to reach the servers. */
    list(): ExternalServer[];
    has(server: string, tool: string): boolean;
    call(server: string, tool: string, args: Record<string, unknown>): Promise<ToolResult>;
    close(): Promise<void>;
    private open;
}
