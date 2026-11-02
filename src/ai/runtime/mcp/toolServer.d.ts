import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ScopedLog } from "../diagnostics.js";
import type { ToolResult, ToolSpec } from "../tools.js";
/**
 * The application's tools as an MCP server. Providers that host MCP servers
 * in-process (Claude through the Agent SDK) get the instance; providers that
 * only take a URL (Codex) get it over HTTP on 127.0.0.1, behind a token made
 * for one session. Either way every call goes through `call`, which is the
 * session's turn sink: validation, events and cancellation stay in the core.
 */
import { TOOL_SERVER_NAME } from "../constants.js";
export { TOOL_SERVER_NAME };
export type ToolCaller = (name: string, args: unknown) => Promise<ToolResult>;
export declare function createToolMcpServer(tools: readonly ToolSpec[], call: ToolCaller, name?: string): McpServer;
/** One MCP server the bridge serves: the application's (`edukors`) or one of the user's, under its own name. */
export interface BridgedServer {
    name: string;
    tools: readonly ToolSpec[];
    call: ToolCaller;
}
export interface ToolBridge {
    /** The address of the application's tools (`/mcp`). */
    url: string;
    /** The address of a server by name: `/mcp` for the application's, `/mcp/<name>` for the others. */
    urlFor(name: string): string;
    /** Sent by the provider as `Authorization: Bearer <token>`. Never written to disk or argv. */
    token: string;
    close(): Promise<void>;
}
export declare function startToolBridge(servers: readonly BridgedServer[], log: ScopedLog): Promise<ToolBridge>;
