import type { Options, Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderAdapter, Workspace } from "../../provider.js";
/** The built-in tools a workspace adds. */
export declare function workspaceTools(workspace: Workspace): string[];
/**
 * The settings of a workspace session (the flag layer, above everything but
 * managed settings): its tools allowed, writes to the protected paths and the
 * extra folders denied, and commands in Claude Code's sandbox, which writes
 * only the workspace, and reads nothing where users' or temporary files are
 * kept (home folders, mounted volumes, temporary folders) except the
 * workspace, its extra folders, the usual tool installations and the
 * session's own temporary folder (`tempDir`, Claude Code's
 * CLAUDE_CODE_TMPDIR), which its shell writes. Denying reads from the root instead would stop
 * Node from starting, since the sandbox cannot leave the root's listing open.
 */
export declare function workspaceSettings(workspace: Workspace, platform?: NodeJS.Platform, tempDir?: string): Record<string, unknown>;
/** The decision for a workspace tool that reaches the permission handler. */
export declare function workspaceDecision(workspace: Workspace, toolName: string, input: Record<string, unknown>): string | null;
/**
 * Claude Code, through the Claude Agent SDK driving the user's own `claude`.
 *
 * Each account is a Claude Code configuration directory of its own
 * (CLAUDE_CONFIG_DIR, the account's managed home). Claude Code keys its
 * macOS Keychain entry by that directory, which is what isolates accounts;
 * this is to be confirmed with live accounts (docs/compatibility.md).
 *
 * The session gets the application's tools (in-process MCP server) and
 * AskUserQuestion, nothing else by default: no shell, no files, no personal
 * settings, skills or MCP servers.
 */
export interface ClaudeProviderOptions {
    /** Absolute path to `claude`, from advanced settings. */
    executable?: string;
    minVersion?: string;
    /** Claude Code's built-in tools offered besides the application's. */
    builtInTools?: string[];
    /** Extra variables for the provider process (advanced settings, tests). */
    env?: Record<string, string>;
    /** For tests: an SDK stand-in. */
    loadSdk?: () => Promise<ClaudeSdk>;
    /** For tests: where to look for `claude`. */
    searchEnv?: NodeJS.ProcessEnv;
    startupTimeoutMs?: number;
    /** For tests: the platform the capabilities describe. */
    platform?: NodeJS.Platform;
}
export interface ClaudeSdk {
    query(params: {
        prompt: AsyncIterable<SDKUserMessage>;
        options?: Options;
    }): Query;
}
/** Logged out, Claude Code still reports `tokenSource: "none"`; a source counts only when it names one. */
export declare function signedIn(account: {
    email?: string;
    subscriptionType?: string;
    tokenSource?: string;
    apiKeySource?: string;
    apiProvider?: string;
} | null | undefined): boolean;
export declare function createClaudeProvider(options?: ClaudeProviderOptions): ProviderAdapter;
