import type { AiEventListener, Usage } from "./events.js";
import { Diagnostics, type DiagnosticEntry, type LogSink } from "./diagnostics.js";
import { DataPaths } from "./platform/paths.js";
import { AccountRegistry } from "./registry/registry.js";
import type { AccountStatus, Capabilities, Detection, LoginPrompt, ModelInfo, ProviderAdapter, SessionOptions } from "./provider.js";
import { AiSession, type Authorizer } from "./session.js";
import { type ToolDefinition } from "./tools.js";
import { type WorkspaceOptions } from "./workspace.js";
export interface AiCliOptions {
    /** Identifies the application, e.g. `slides` or `graph`. Namespaces sessions and logs. */
    appId: string;
    providers: ProviderAdapter[];
    /** Defaults to the shared per-OS-user EDUKORS directory. */
    dataDir?: string;
    /** Receives every (already redacted) diagnostic entry. */
    logSink?: LogSink;
    /** How long a provider has to stop after an interruption before it is shut down. */
    interruptGraceMs?: number;
    /** How long a detection result is reused. */
    detectionTtlMs?: number;
    /** How long `connectAccount` waits for another process signing in to the same provider. */
    authLockTimeoutMs?: number;
}
export interface AccountInfo {
    id: string;
    providerId: string;
    label: string;
    createdAt: string;
    updatedAt: string;
    /** Absolute path of the account's managed provider directory (advanced settings only). */
    homeDir: string;
    /** False when this application has no adapter for the account's provider. */
    supported: boolean;
}
export interface OpenSessionOptions {
    accountId: string;
    documentId: string;
    instructions?: string;
    tools?: ToolDefinition[];
    options?: SessionOptions;
    /** A provider conversation id saved from a previous session (`session.resumeId`). */
    resumeId?: string;
    /**
     * The user's own MCP servers (`{ name: { command, args, env } | { type: "http" | "sse", url, headers } }`).
     * The library connects to them and offers their tools; each call goes through `authorize`.
     */
    mcpServers?: Record<string, unknown>;
    /** Decides each call to a user's MCP server. Without it, such calls are denied. */
    authorize?: Authorizer;
    /** A folder of skills (`<name>/SKILL.md`) to offer; no other skill is enabled. */
    skillsDir?: string;
    /**
     * A folder the agent works in with the provider's own file and web tools,
     * and commands where a sandbox confines them (capabilities `workspace` and
     * `workspaceShell`). Without it, the agent has only the application's tools.
     */
    workspace?: WorkspaceOptions;
}
export interface DiagnosticReport {
    library: {
        name: string;
        version: string;
    };
    appId: string;
    platform: string;
    arch: string;
    node: string;
    providers: Detection[];
    accounts: Record<string, number>;
    sessions: {
        id: string;
        providerId: string;
        state: string;
        lateEventsDropped: number;
    }[];
    entries: DiagnosticEntry[];
}
export declare class AiCli {
    private readonly options;
    readonly appId: string;
    readonly paths: DataPaths;
    readonly registry: AccountRegistry;
    readonly diagnostics: Diagnostics;
    private readonly adapters;
    private readonly detections;
    private readonly openSessions;
    private readonly listeners;
    private readonly authMutex;
    /** Sign-ins in progress in this process, by account, waiting for a pasted code or not. */
    private readonly logins;
    private readonly log;
    private seq;
    private disposed;
    constructor(options: AiCliOptions);
    providers(): {
        id: string;
        displayName: string;
        installUrl?: string;
    }[];
    /** Whether a provider's CLI is installed and compatible. Cached; `refresh` re-checks. */
    detect(providerId: string, options?: {
        refresh?: boolean;
    }): Promise<Detection>;
    detectAll(options?: {
        refresh?: boolean;
    }): Promise<Detection[]>;
    capabilities(providerId: string): Promise<Capabilities>;
    listAccounts(): Promise<AccountInfo[]>;
    createAccount(input: {
        providerId: string;
        label?: string;
    }): Promise<AccountInfo>;
    /** Labels are display-only; the account id, and every session, stays the same. */
    renameAccount(accountId: string, label: string): Promise<AccountInfo>;
    /**
     * Removes the account from the shared registry, for every EDUKORS
     * application. Sessions this application has open on it are closed.
     * `deleteData` also deletes the account's managed directory; it never
     * touches the user's own provider configuration.
     */
    removeAccount(accountId: string, options?: {
        deleteData?: boolean;
    }): Promise<void>;
    /**
     * Starts the provider's sign-in flow for this account. Sign-ins to the same
     * provider are serialized, in this process and across EDUKORS applications.
     */
    connectAccount(accountId: string, options?: {
        signal?: AbortSignal;
        onLogin?: (prompt: LoginPrompt) => void;
    }): Promise<AccountStatus>;
    /**
     * Hands the code the user pasted to a sign-in waiting for one (after an
     * `onLogin` prompt with `acceptsCode`). The code is never logged.
     */
    submitLoginCode(accountId: string, code: string): void;
    accountStatus(accountId: string, options?: {
        signal?: AbortSignal;
    }): Promise<AccountStatus>;
    /** Signs the account out at the provider. Unlike `removeAccount`, it stays in the registry. */
    logoutAccount(accountId: string): Promise<void>;
    listModels(accountId: string): Promise<ModelInfo[]>;
    /** `null` means the provider did not report usage: unknown, not zero. */
    readUsage(accountId: string): Promise<Usage | null>;
    /**
     * Opens a conversation for one document on one account. Switching accounts
     * means opening a new session: a session id is never reused across accounts.
     */
    openSession(input: OpenSessionOptions): Promise<AiSession>;
    sessions(): AiSession[];
    /** Every event of every session of this instance. Returns an unsubscribe function. */
    onEvent(listener: AiEventListener): () => void;
    /** Safe to export: no credentials, no document content. */
    diagnosticReport(): Promise<DiagnosticReport>;
    /** Closes every session and stops every provider process this instance started. */
    dispose(): Promise<void>;
    private adapter;
    private accountInfo;
    private accountContext;
    private guard;
    private unsupported;
    private publish;
}
export declare const createAiCli: (options: AiCliOptions) => AiCli;
