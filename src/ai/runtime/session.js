import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { AiError, toAiError } from "./errors.js";
/** The request's text, followed by the attached files' paths, which the agent opens with its own tools. */
const withAttachments = (text, attachments) => !attachments.length ? text : `${text}\n\nAttached files (open them with your file tools; images and PDFs can be read directly):\n${attachments.map((a) => `- ${a.name} (${a.mimeType}): ${a.path}`).join("\n")}`;
const settledWithin = (turn, ms) => Promise.race([turn.settled.then(() => true), new Promise((r) => setTimeout(() => r(false), ms).unref())]);
export class AiSession {
    deps;
    id;
    appId;
    documentId;
    accountId;
    providerId;
    _state = "opening";
    provider = null;
    /** Identifies the current provider instance; hooks from older ones are ignored. */
    providerToken = null;
    _resumeId;
    turn = null;
    closing = false;
    options;
    listeners = new Set();
    droppedEvents = 0;
    constructor(deps) {
        this.deps = deps;
        this.id = deps.scope.sessionId;
        this.appId = deps.scope.appId;
        this.documentId = deps.scope.documentId;
        this.accountId = deps.scope.accountId;
        this.providerId = deps.scope.providerId;
        this.options = { ...deps.options };
    }
    get state() {
        return this._state;
    }
    /** The provider's own conversation id, for applications that persist it to resume later. */
    get resumeId() {
        return this._resumeId;
    }
    /** Events of this session only. Returns an unsubscribe function. */
    on(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /** Opens (or reopens) the provider session. Called by the library; reopening happens on demand. */
    async start(resumeId) {
        if (this.closing)
            throw new AiError("SESSION_CLOSED", "the session is closed");
        this._state = "opening";
        const context = await this.deps.context();
        context.options = { ...this.options };
        if (resumeId && this.deps.capabilities.persistentSessions)
            context.resumeId = resumeId;
        const token = {};
        this.providerToken = token;
        let instance;
        try {
            instance = await this.deps.adapter.openSession(context, { exited: (error) => this.providerExited(token, error) });
        }
        catch (e) {
            if (this.providerToken === token)
                this.providerToken = null;
            this._state = this.closing ? "closed" : "failed";
            throw toAiError(e, "PROVIDER_START_FAILED");
        }
        if (this.closing || this.providerToken !== token) {
            await instance.close().catch(() => undefined);
            throw new AiError("SESSION_CLOSED", "the session is closed");
        }
        this.provider = instance;
        const resumed = context.resumeId !== undefined && instance.resumeId === context.resumeId;
        this._resumeId = instance.resumeId ?? this._resumeId;
        this._state = "idle";
        this.emit({ type: "sessionOpened", resumed });
    }
    /**
     * Sends a request and resolves when it ends. Failures resolve with
     * `status: "failed"` and are also emitted as `error` events; only misuse
     * (a closed or busy session) rejects.
     */
    async send(text, options = {}) {
        if (this.closing)
            throw new AiError("SESSION_CLOSED", "the session is closed");
        if (this.turn)
            throw new AiError("SESSION_BUSY", "a request is already in progress");
        const turn = this.newTurn(options.requestId ?? randomUUID());
        this.turn = turn;
        this._state = "busy";
        try {
            this.emit({ type: "activity", phase: "preparing" }, turn.requestId);
            if (!this.provider) {
                await this.start(this._resumeId);
                this._state = "busy";
            }
            if (turn.cancelled)
                return this.finish(turn, "cancelled");
            const provider = this.provider;
            if (!provider)
                throw new AiError("PROVIDER_CRASHED", "the provider stopped before the request started");
            const attachments = options.attachments?.length ? await this.saveAttachments(turn.requestId, options.attachments) : [];
            const outcome = await provider.send({ requestId: turn.requestId, text: withAttachments(text, attachments), ...(attachments.length ? { attachments } : {}), ...(options.context !== undefined ? { context: options.context } : {}) }, this.sinkFor(turn));
            return this.finish(turn, turn.cancelled ? "cancelled" : outcome);
        }
        catch (e) {
            if (turn.cancelled)
                return this.finish(turn, "cancelled");
            const error = toAiError(e, "PROVIDER_ERROR");
            if (error.code === "PROVIDER_CRASHED" || error.code === "PROVIDER_START_FAILED")
                this.dropProvider();
            this.deps.log.warn(`request failed: ${error.code}`, { message: error.message, cause: error.cause });
            return this.finish(turn, "failed", error);
        }
    }
    /**
     * Stops the current request. Resolves once it has settled: already
     * committed tool calls stay committed, nothing after this point is applied.
     * A provider that does not stop within the grace period is shut down and
     * restarted (resumed) on the next request.
     */
    async interrupt() {
        const turn = this.turn;
        if (!turn)
            return;
        if (!turn.cancelled) {
            turn.cancelled = true;
            turn.abort.abort();
            if (!this.closing)
                this._state = "interrupting";
            for (const q of turn.questions.values())
                q.reject(new AiError("CANCELLED", "the request was cancelled"));
            turn.questions.clear();
            const provider = this.provider;
            provider?.interrupt().catch((e) => this.deps.log.warn("provider interrupt failed", e));
            if (!(await settledWithin(turn, this.deps.interruptGraceMs))) {
                this.deps.log.warn("provider did not stop in time; shutting it down");
                this.dropProvider();
                await provider?.close().catch((e) => this.deps.log.warn("provider close failed", e));
                // A well-behaved adapter settles `send` on close; otherwise settle it here.
                if (!(await settledWithin(turn, this.deps.interruptGraceMs)))
                    this.finish(turn, "cancelled");
            }
        }
        await turn.settled;
    }
    /** Answers a `question` event. */
    answer(questionId, answer) {
        const pending = this.turn?.questions.get(questionId);
        if (!pending)
            throw new AiError("QUESTION_NOT_FOUND", "no such question is waiting", { meta: { questionId } });
        this.turn.questions.delete(questionId);
        pending.resolve(answer);
    }
    async updateOptions(options) {
        if (this.closing)
            throw new AiError("SESSION_CLOSED", "the session is closed");
        const next = { ...this.options, ...options };
        if (this.provider) {
            if (!this.deps.capabilities.liveOptions || !this.provider.updateOptions) {
                throw new AiError("CAPABILITY_UNSUPPORTED", "this provider cannot change options in an open session", { meta: { providerId: this.providerId } });
            }
            await this.provider.updateOptions(next);
        }
        this.options = next;
    }
    async close(reason = "closed") {
        if (this.closing)
            return;
        this.closing = true;
        await this.interrupt();
        const provider = this.provider;
        this.dropProvider();
        await provider?.close().catch((e) => this.deps.log.warn("provider close failed", e));
        this._state = "closed";
        this.emit({ type: "sessionClosed", reason });
        this.deps.onClosed(this);
    }
    /** Counts provider output that arrived for a request no longer current. */
    get lateEventsDropped() {
        return this.droppedEvents;
    }
    // ---------------------------------------------------------------- internals
    newTurn(requestId) {
        let settle;
        const settled = new Promise((r) => (settle = r));
        return { requestId, abort: new AbortController(), cancelled: false, result: null, questions: new Map(), settled, settle };
    }
    finish(turn, status, error) {
        if (turn.result)
            return turn.result;
        const result = { requestId: turn.requestId, status, ...(error ? { error: error.toJSON() } : {}) };
        turn.result = result;
        for (const q of turn.questions.values())
            q.reject(new AiError("CANCELLED", "the request ended"));
        turn.questions.clear();
        if (!turn.abort.signal.aborted)
            turn.abort.abort();
        if (this.turn === turn)
            this.turn = null;
        if (!this.closing)
            this._state = status === "failed" && !this.provider ? "failed" : "idle";
        if (status === "completed")
            this.emit({ type: "turnCompleted" }, turn.requestId);
        else if (status === "cancelled")
            this.emit({ type: "cancelled" }, turn.requestId);
        else
            this.emit({ type: "error", error: result.error }, turn.requestId);
        turn.settle();
        return result;
    }
    dropProvider() {
        this.provider = null;
        this.providerToken = null;
    }
    providerExited(token, error) {
        if (token !== this.providerToken)
            return;
        this.dropProvider();
        // During a request the adapter rejects `send`, which reports the failure.
        if (this.turn || this.closing)
            return;
        this._state = "failed";
        const err = toAiError(error, "PROVIDER_CRASHED");
        this.deps.log.warn("provider exited while idle", { code: err.code, message: err.message });
        this.emit({ type: "error", error: err.toJSON() });
    }
    sinkFor(turn) {
        const live = () => this.turn === turn && !turn.abort.signal.aborted;
        const drop = (what) => {
            this.droppedEvents++;
            this.deps.log.debug(`dropped late ${what}`, { requestId: turn.requestId });
        };
        return {
            signal: turn.abort.signal,
            text: (delta) => (live() ? this.emit({ type: "textDelta", text: delta }, turn.requestId) : drop("text")),
            activity: (phase, detail) => (live() ? this.emit({ type: "activity", phase, ...(detail ? { detail } : {}) }, turn.requestId) : drop("activity")),
            usage: (usage) => (live() ? this.emit({ type: "usageUpdated", usage: { ...usage, observedAt: usage.observedAt ?? new Date().toISOString() } }, turn.requestId) : drop("usage")),
            callTool: (name, args) => this.callTool(turn, live, name, args),
            callExternal: (server, tool, args) => this.callExternal(turn, live, server, tool, args),
            authorizeNative: (action) => this.authorizeNative(turn, live, action),
            ask: (question) => {
                if (!live()) {
                    drop("question");
                    return Promise.reject(new AiError("CANCELLED", "the request is no longer active"));
                }
                const questionId = randomUUID();
                return new Promise((resolve, reject) => {
                    turn.questions.set(questionId, { resolve, reject });
                    this.emit({ type: "question", questionId, prompt: question.prompt, ...(question.options ? { options: question.options } : {}) }, turn.requestId);
                });
            },
        };
    }
    async callTool(turn, live, name, args) {
        if (!live()) {
            this.droppedEvents++;
            return { content: "The request was cancelled; the tool was not run.", isError: true };
        }
        const callId = randomUUID();
        const tool = this.deps.tools.get(name);
        this.emit({ type: "toolStarted", callId, tool: name }, turn.requestId);
        const fail = (code, message) => {
            this.emit({ type: "toolCompleted", callId, tool: name, ok: false, errorCode: code }, turn.requestId);
            return { content: message, isError: true };
        };
        if (!tool)
            return fail("TOOL_NOT_FOUND", `Unknown tool: ${name}`);
        if (args === null || args === undefined)
            args = {};
        if (typeof args !== "object" || Array.isArray(args))
            return fail("TOOL_INVALID_ARGUMENTS", "Tool arguments must be a JSON object.");
        let value = args;
        if (tool.validate) {
            const checked = tool.validate(value);
            if (!checked.ok)
                return fail("TOOL_INVALID_ARGUMENTS", `Invalid arguments for ${name}: ${checked.message}`);
            value = checked.value;
        }
        try {
            const result = await tool.run(value, { documentId: this.documentId, requestId: turn.requestId, callId, signal: turn.abort.signal });
            // Reported even after an interruption: the application did run it.
            this.emit({ type: "toolCompleted", callId, tool: name, ok: !result.isError, ...(result.isError ? { errorCode: "TOOL_FAILED" } : {}) }, turn.requestId);
            return result;
        }
        catch (e) {
            this.deps.log.warn(`tool ${name} threw`, e);
            return fail(e instanceof AiError ? e.code : "TOOL_FAILED", `Tool ${name} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async callExternal(turn, live, server, tool, args) {
        if (!live()) {
            this.droppedEvents++;
            return { content: "The request was cancelled; the tool was not run.", isError: true };
        }
        const callId = randomUUID();
        const name = `mcp__${server}__${tool}`;
        this.emit({ type: "toolStarted", callId, tool: name }, turn.requestId);
        const fail = (code, message) => {
            this.emit({ type: "toolCompleted", callId, tool: name, ok: false, errorCode: code }, turn.requestId);
            return { content: message, isError: true };
        };
        if (!this.deps.external?.has(server, tool))
            return fail("TOOL_NOT_FOUND", `Unknown tool: ${name}`);
        const input = args && typeof args === "object" && !Array.isArray(args) ? args : {};
        try {
            const decision = this.deps.authorize
                ? await this.deps.authorize({ kind: "mcp", callId, server, tool, input, documentId: this.documentId, requestId: turn.requestId, signal: turn.abort.signal })
                : { allow: false, message: "This application does not allow calls to MCP servers." };
            if (!decision.allow)
                return fail("TOOL_DENIED", decision.message || "The user declined this action.");
            if (!live())
                return fail("CANCELLED", "The request was cancelled; the tool was not run.");
            const result = await this.deps.external.call(server, tool, input);
            this.emit({ type: "toolCompleted", callId, tool: name, ok: !result.isError, ...(result.isError ? { errorCode: "TOOL_FAILED" } : {}) }, turn.requestId);
            return result;
        }
        catch (e) {
            this.deps.log.warn(`MCP tool ${name} failed`, e);
            return fail("TOOL_FAILED", `${name} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    /**
     * A native action of the provider in the working folder (creating or editing a file, running a command), put to
     * the application, which decides by its mode (Common: "review before applying" asks the person). Reading and the
     * web are not put. Without an authorizer, actions go ahead: the folder and the sandbox still confine them.
     */
    async authorizeNative(turn, live, action) {
        if (!live())
            return { allow: false, message: "The request was cancelled." };
        if (!this.deps.authorize)
            return { allow: true };
        try {
            const decision = await this.deps.authorize({ kind: "native", ...action, documentId: this.documentId, requestId: turn.requestId, signal: turn.abort.signal });
            if (!live())
                return { allow: false, message: "The request was cancelled." };
            return decision?.allow ? { allow: true } : { allow: false, message: decision?.message || "The user declined this action." };
        }
        catch (e) {
            this.deps.log.warn("native action authorization failed", e);
            return { allow: false, message: "The action could not be authorized." };
        }
    }
    /**
     * Files attached to a request, written to the session's attachments folder (readable by the agent, never
     * writable): { name, mimeType, path }. Names keep only safe characters; each request has its own subfolder.
     */
    async saveAttachments(requestId, attachments) {
        const dir = join(this.deps.attachmentsDir, requestId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "request");
        await mkdir(dir, { recursive: true });
        const saved = [];
        for (const [index, file] of attachments.entries()) {
            const base = basename(String(file.name || `file-${index + 1}`)).replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^\.+/, "").slice(0, 120) || `file-${index + 1}`;
            const name = saved.some((s) => s.name === base) ? `${index + 1}-${base}` : base;
            const path = join(dir, name);
            await writeFile(path, file.data);
            saved.push({ name, mimeType: file.mimeType || "application/octet-stream", path });
        }
        this.lastAttachmentsForTest = saved;
        return saved;
    }
    /** Reports the user's MCP servers once the session is open. */
    reportServers(statuses) {
        for (const s of statuses)
            this.emit({ type: "mcpServerStatus", ...s });
    }
    emit(body, requestId) {
        const event = this.deps.publish({ ...this.deps.scope, ...(requestId ? { requestId } : {}), ...body });
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch (e) {
                this.deps.log.error("session listener threw", e);
            }
        }
    }
}
