import { AiCliError } from "../../errors.js";
import { type Usage } from "../../events.js";
import type { ProviderAdapter } from "../../provider.js";
/**
 * OpenAI Codex, through its app server (`codex app-server`): JSON-RPC over
 * stdio, the interface Codex's own editor extensions use.
 *
 * Each account is a Codex home of its own (CODEX_HOME, the account's managed
 * home), where Codex keeps its sign-in. The user's own ~/.codex is never read
 * or copied. The application's tools reach Codex as an MCP server on
 * 127.0.0.1 (agent bridge), given on the command line with `-c` so that two
 * documents on the same account never share or rewrite a config file; the
 * bridge token travels in the environment, not in argv.
 *
 * In a workspace (macOS only), the app server runs inside the system
 * sandbox (platform/sandbox.ts), which confines Codex and every command it
 * runs to the workspace; Codex is told its commands already run in an
 * external sandbox, since it cannot apply its own inside another.
 */
export interface CodexProviderOptions {
    executable?: string;
    minVersion?: string;
    /** Extra variables for the provider process (advanced settings, tests). */
    env?: Record<string, string>;
    /** For tests: where to look for `codex`. */
    searchEnv?: NodeJS.ProcessEnv;
    startupTimeoutMs?: number;
    /** For tests: the platform the capabilities describe. */
    platform?: NodeJS.Platform;
    /**
     * For tests: runs the app server without the system sandbox. The
     * workspace is then not confined; never set in an application.
     */
    unconfinedWorkspace?: boolean;
}
/** Every window of every limit, from 0 to 1; the most used one leads. */
export declare function codexLimits(read: any): Omit<Usage, "observedAt"> | null;
/** Codex's turn errors, as stable codes. */
export declare function codexError(error: any): AiCliError;
export declare function createCodexProvider(options?: CodexProviderOptions): ProviderAdapter;
