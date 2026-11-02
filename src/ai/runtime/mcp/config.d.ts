import type { McpServerSpec } from "./external.js";
/**
 * The user's MCP servers as written in an editor's settings: the text of a
 * Claude Code `.mcp.json` (`{ "mcpServers": { ... } }`), or just the object of
 * servers, so that what a server's documentation says to paste is what goes
 * in. Problems are stable codes the editor translates, all of them at once.
 */
export type McpProblemCode = "notJson" | "notServers" | "reserved" | "badName" | "notObject" | "noCommand" | "noUrl" | "badField" | "badType";
export interface McpProblem {
    code: McpProblemCode;
    server?: string;
    field?: string;
    detail?: string;
}
/** The valid servers, and every problem found. Empty text is no servers. */
export declare function parseMcpConfig(input: string | unknown): {
    servers: Record<string, McpServerSpec>;
    problems: McpProblem[];
};
