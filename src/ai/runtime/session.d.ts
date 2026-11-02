import { type SerializedError } from "./errors.js";
import type { AiEvent, AiEventListener, EventScope, SessionCloseReason } from "./events.js";
import type { ScopedLog } from "./diagnostics.js";
import type { Capabilities, ProviderAdapter, SessionContext, SessionOptions } from "./provider.js";
import type { ToolDefinition, ToolResult } from "./tools.js";
/**
 * One conversation: one application, one document, one account.
 *
 * The session owns the identity rules the plan requires. Every request gets
 * its own sink; once the request is interrupted, finished or replaced, that
 * sink drops whatever the provider still sends, so late output never reaches
 * the document. A provider that crashes is restarted on the next request,
 * resuming its conversation when the provider supports it.
 */
export type SessionState = "opening" | "idle" | "busy" | "interrupting" | "failed" | "closed";
export interface TurnResult {
    requestId: string;
    status: "completed" | "cancelled" | "failed";
    error?: SerializedError;
}
export interface SendOptions {
    /** Supplied by the application to correlate events with its own records. */
    requestId?: string;
    /** Latest document state, including unsaved manual edits. */
    context?: string;
}
/** What the application decides about a call to one of the user's MCP servers. */
export interface AuthorizationRequest {
    kind: "mcp";
    /** The `callId` of this call's toolStarted/toolCompleted events. */
    callId: string;
    server: string;
    tool: string;
    input: Record<string, unknown>;
    documentId: string;
    requestId: string;
    signal: AbortSignal;
}
export type AuthorizationDecision = {
    allow: true;
} | {
    allow: false;
    message?: string;
};
export type Authorizer = (request: AuthorizationRequest) => Promise<AuthorizationDecision> | AuthorizationDecision;
/** The user's MCP servers as the session reaches them (see mcp/external.ts). */
export interface ExternalCaller {
    has(server: string, tool: string): boolean;
    call(server: string, tool: string, args: Record<string, unknown>): Promise<ToolResult>;
}
export interface SessionDeps {
    adapter: ProviderAdapter;
    capabilities: Capabilities;
    scope: Omit<EventScope, "requestId">;
    /** Builds a fresh provider context (account home, work dir, tools). */
    context: () => Promise<SessionContext>;
    tools: ReadonlyMap<string, ToolDefinition>;
    external?: ExternalCaller;
    /** Without one, every call to a user's MCP server is denied. */
    authorize?: Authorizer;
    options: SessionOptions;
    publish: (event: Omit<AiEvent, "seq" | "at">) => AiEvent;
    log: ScopedLog;
    interruptGraceMs: number;
    onClosed: (session: AiSession) => void;
}
export declare class AiSession {
    private readonly deps;
    readonly id: string;
    readonly appId: string;
    readonly documentId: string;
    readonly accountId: string;
    readonly providerId: string;
    private _state;
    private provider;
    /** Identifies the current provider instance; hooks from older ones are ignored. */
    private providerToken;
    private _resumeId;
    private turn;
    private closing;
    private options;
    private readonly listeners;
    private droppedEvents;
    constructor(deps: SessionDeps);
    get state(): SessionState;
    /** The provider's own conversation id, for applications that persist it to resume later. */
    get resumeId(): string | undefined;
    /** Events of this session only. Returns an unsubscribe function. */
    on(listener: AiEventListener): () => void;
    /** Opens (or reopens) the provider session. Called by the library; reopening happens on demand. */
    start(resumeId?: string): Promise<void>;
    /**
     * Sends a request and resolves when it ends. Failures resolve with
     * `status: "failed"` and are also emitted as `error` events; only misuse
     * (a closed or busy session) rejects.
     */
    send(text: string, options?: SendOptions): Promise<TurnResult>;
    /**
     * Stops the current request. Resolves once it has settled: already
     * committed tool calls stay committed, nothing after this point is applied.
     * A provider that does not stop within the grace period is shut down and
     * restarted (resumed) on the next request.
     */
    interrupt(): Promise<void>;
    /** Answers a `question` event. */
    answer(questionId: string, answer: string): void;
    updateOptions(options: SessionOptions): Promise<void>;
    close(reason?: SessionCloseReason): Promise<void>;
    /** Counts provider output that arrived for a request no longer current. */
    get lateEventsDropped(): number;
    private newTurn;
    private finish;
    private dropProvider;
    private providerExited;
    private sinkFor;
    private callTool;
    private callExternal;
    /** Reports the user's MCP servers once the session is open. */
    reportServers(statuses: {
        server: string;
        status: "connected" | "failed";
        tools?: number;
        error?: string;
    }[]): void;
    private emit;
}
