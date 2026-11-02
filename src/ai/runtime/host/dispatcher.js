import { z } from "zod";
import { AiError, toAiError } from "../errors.js";
import { VERSION } from "../version.js";
import { isAbsolute } from "node:path";
import { listSkills } from "../skills.js";
/**
 * The application-host protocol, independent of its transport. One dispatcher
 * serves one application window: the development host (tools/dev-host.mjs) sends
 * the messages over HTTP and server-sent events, the Electron host
 * (desktop/host.mjs) over IPC, and the tests over a pair of streams.
 *
 *   app → host   { id, method, params }          a request
 *   host → app   { id, result } | { id, error }  its answer
 *   host → app   { event }                        a normalized AiEvent
 *   host → app   { login: { requestId, accountId, url, acceptsCode } }
 *                a sign-in address for the user while accounts.connect runs;
 *                with acceptsCode, the app collects the pasted code and sends
 *                accounts.submitCode
 *   host → app   { id: "h:<n>", method: "tool.call", params }   the host asks the app to run a tool
 *   host → app   { id: "h:<n>", method: "tool.authorize", params }
 *                the host asks the app whether a call to one of the user's MCP
 *                servers may go ahead; the app answers { allow, message? }
 *   app → host   { id: "h:<n>", result } | { id: "h:<n>", error }
 *
 * The first message is { ready: { protocol, version } }.
 *
 * `methods` adds requests that belong to the embedding host rather than to the
 * library (for example, opening the skills folder): name → async (params) => result.
 * They cannot replace the protocol's own methods.
 */
export const HOST_PROTOCOL_VERSION = 1;
const ToolSpecSchema = z.object({ name: z.string(), description: z.string(), inputSchema: z.record(z.string(), z.unknown()) });
const Options = z.object({ model: z.string().optional(), effort: z.string().optional() });
const Account = z.object({ accountId: z.string() });
const SessionRef = z.object({ sessionId: z.string() });
const METHODS = {
    "providers.list": z.object({}),
    "providers.detect": z.object({ providerId: z.string().optional(), refresh: z.boolean().optional() }),
    "providers.capabilities": z.object({ providerId: z.string() }),
    "accounts.list": z.object({}),
    "accounts.create": z.object({ providerId: z.string(), label: z.string().optional() }),
    "accounts.rename": Account.extend({ label: z.string() }),
    "accounts.remove": Account.extend({ deleteData: z.boolean().optional() }),
    "accounts.connect": Account,
    "accounts.submitCode": Account.extend({ code: z.string() }),
    "accounts.status": Account,
    "accounts.logout": Account,
    "models.list": Account,
    "usage.read": Account,
    "session.open": z.object({
        accountId: z.string(),
        documentId: z.string(),
        instructions: z.string().optional(),
        tools: z.array(ToolSpecSchema).optional(),
        options: Options.optional(),
        resumeId: z.string().optional(),
        mcpServers: z.record(z.string(), z.unknown()).optional(),
        skillsDir: z.string().optional(),
        workspace: z
            .object({ dir: z.string(), readDirs: z.array(z.string()).optional(), protect: z.array(z.string()).optional(), web: z.boolean().optional(), shell: z.boolean().optional() })
            .optional(),
    }),
    // Common: files attached to the request ({ name, mimeType, data: base64 }), saved for the agent to open.
    "session.send": SessionRef.extend({ text: z.string(), requestId: z.string().optional(), context: z.string().optional(), attachments: z.array(z.object({ name: z.string().max(255), mimeType: z.string().max(200).optional(), data: z.string() })).max(20).optional() }),
    "session.interrupt": SessionRef,
    "session.answer": SessionRef.extend({ questionId: z.string(), answer: z.string() }),
    "session.updateOptions": SessionRef.extend({ options: Options }),
    "session.close": SessionRef,
    "diagnostics.report": z.object({}),
    /** The skills in a folder, for the settings screen. */
    "skills.list": z.object({ dir: z.string() }),
    /** Aborts a pending request that supports it (accounts.connect). */
    cancel: z.object({ requestId: z.union([z.string(), z.number()]) }),
};
const Message = z.object({
    id: z.union([z.string(), z.number()]),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
    error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
});
const ToolReply = z.object({ content: z.string(), isError: z.boolean().optional() });
const AuthorizeReply = z.object({ allow: z.boolean(), message: z.string().optional() });
export function createHostDispatcher({ ai, send, toolTimeoutMs = 120_000, methods: extra = {} }) {
    const log = ai.diagnostics.scoped("host");
    const write = (msg) => send(msg);
    const sessions = new Map();
    const aborts = new Map();
    /** Requests to the app waiting for its answer: tool calls and authorizations. */
    const toolCalls = new Map();
    /** Asks the app something and waits; the timeout answers with `fallback`. */
    const askApp = (method, params, parse, fallback) => new Promise((resolve) => {
        const id = `h:${nextToolCall++}`;
        const timer = setTimeout(() => {
            toolCalls.delete(id);
            resolve(fallback);
        }, toolTimeoutMs);
        toolCalls.set(id, { resolve: (result, error) => resolve(parse(result, error)), timer });
        write({ id, method, params });
    });
    const inFlight = new Set();
    let nextToolCall = 1;
    const unsubscribe = ai.onEvent((event) => write({ event }));
    /** A tool whose work happens in the application, across the pipe. */
    const remoteTool = (spec, sessionId) => ({
        ...spec,
        run: (args, context) => askApp("tool.call", { sessionId: sessionId(), requestId: context.requestId, callId: context.callId, documentId: context.documentId, name: spec.name, args }, (result, error) => {
            const reply = ToolReply.safeParse(result);
            return error || !reply.success ? { content: error?.message ?? "The editor returned an invalid tool result.", isError: true } : reply.data;
        }, { content: "The editor did not answer in time.", isError: true }),
    });
    const session = (id) => {
        const found = sessions.get(id);
        if (!found)
            throw new AiError("SESSION_CLOSED", "no such session", { meta: { sessionId: id } });
        return found;
    };
    async function handle(id, method, raw) {
        const parsed = METHODS[method].safeParse(raw ?? {});
        if (!parsed.success)
            throw new AiError("INVALID_ARGUMENT", z.prettifyError(parsed.error), { meta: { method } });
        const p = parsed.data;
        switch (method) {
            case "providers.list":
                return ai.providers();
            case "providers.detect":
                return p.providerId ? [await ai.detect(p.providerId, { refresh: p.refresh })] : ai.detectAll({ refresh: p.refresh });
            case "providers.capabilities":
                return ai.capabilities(p.providerId);
            case "accounts.list":
                return ai.listAccounts();
            case "accounts.create":
                return ai.createAccount({ providerId: p.providerId, label: p.label });
            case "accounts.rename":
                return ai.renameAccount(p.accountId, p.label);
            case "accounts.remove":
                await ai.removeAccount(p.accountId, { deleteData: p.deleteData });
                return null;
            case "accounts.connect": {
                const controller = new AbortController();
                aborts.set(id, controller);
                try {
                    return await ai.connectAccount(p.accountId, {
                        signal: controller.signal,
                        onLogin: (prompt) => write({ login: { requestId: id, accountId: p.accountId, ...prompt } }),
                    });
                }
                finally {
                    aborts.delete(id);
                }
            }
            case "accounts.submitCode":
                ai.submitLoginCode(p.accountId, p.code);
                return null;
            case "accounts.status":
                return ai.accountStatus(p.accountId);
            case "accounts.logout":
                await ai.logoutAccount(p.accountId);
                return null;
            case "models.list":
                return ai.listModels(p.accountId);
            case "usage.read":
                return ai.readUsage(p.accountId);
            case "session.open": {
                let sessionId = "";
                const tools = (p.tools ?? []).map((t) => remoteTool(t, () => sessionId));
                const opened = await ai.openSession({
                    accountId: p.accountId,
                    documentId: p.documentId,
                    instructions: p.instructions,
                    tools,
                    options: p.options,
                    resumeId: p.resumeId,
                    ...(p.mcpServers ? { mcpServers: p.mcpServers } : {}),
                    ...(p.skillsDir ? { skillsDir: p.skillsDir } : {}),
                    ...(p.workspace ? { workspace: p.workspace } : {}),
                    authorize: ({ signal: _signal, ...request }) => askApp("tool.authorize", { sessionId, ...request }, (result, error) => {
                        const reply = AuthorizeReply.safeParse(result);
                        return error || !reply.success ? { allow: false, message: error?.message ?? "The editor gave no valid answer." } : reply.data.allow ? { allow: true } : { allow: false, ...(reply.data.message ? { message: reply.data.message } : {}) };
                    }, { allow: false, message: "The editor did not answer in time." }),
                });
                sessionId = opened.id;
                sessions.set(opened.id, opened);
                opened.on((e) => e.type === "sessionClosed" && sessions.delete(opened.id));
                return { sessionId: opened.id, resumeId: opened.resumeId ?? null };
            }
            case "session.send":
                return session(p.sessionId).send(p.text, { requestId: p.requestId, context: p.context, ...(p.attachments?.length ? { attachments: p.attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, data: Buffer.from(a.data, "base64") })) } : {}) });
            case "session.interrupt":
                await session(p.sessionId).interrupt();
                return null;
            case "session.answer":
                session(p.sessionId).answer(p.questionId, p.answer);
                return null;
            case "session.updateOptions":
                await session(p.sessionId).updateOptions(p.options);
                return null;
            case "session.close":
                await session(p.sessionId).close();
                return null;
            case "diagnostics.report":
                return ai.diagnosticReport();
            case "skills.list":
                if (!isAbsolute(p.dir))
                    throw new AiError("INVALID_ARGUMENT", "dir must be an absolute path");
                return listSkills(p.dir);
            case "cancel":
                aborts.get(p.requestId)?.abort();
                return null;
        }
    }
    function receive(raw) {
        let message;
        try {
            message = Message.parse(raw);
        }
        catch (e) {
            log.warn("ignored an invalid message", { message: JSON.stringify(raw ?? null).slice(0, 200) });
            return;
        }
        const { id } = message;
        // An answer to a tool call.
        if (typeof id === "string" && id.startsWith("h:") && !message.method) {
            const pending = toolCalls.get(id);
            if (!pending)
                return;
            toolCalls.delete(id);
            clearTimeout(pending.timer);
            pending.resolve(message.result, message.error ?? undefined);
            return;
        }
        const method = message.method;
        const own = Boolean(method) && method in METHODS;
        const added = Boolean(method) && !own && Object.hasOwn(extra, method);
        if (!own && !added) {
            write({ id, error: new AiError("INVALID_ARGUMENT", `unknown method: ${method}`).toJSON() });
            return;
        }
        const work = (own ? handle(id, method, message.params) : Promise.resolve().then(() => extra[method](message.params ?? {})))
            .then((result) => write({ id, result: result ?? null }), (e) => write({ id, error: toAiError(e).toJSON() }));
        inFlight.add(work);
        void work.finally(() => inFlight.delete(work));
    }
    let closing;
    /** The application went away: tools can no longer be answered, and running requests are stopped, but every request still gets its answer. */
    function close() {
        closing ??= (async () => {
            for (const pending of toolCalls.values()) {
                clearTimeout(pending.timer);
                pending.resolve(undefined, { message: "The editor closed." });
            }
            for (const controller of aborts.values())
                controller.abort();
            const settled = Promise.allSettled([...inFlight]);
            unsubscribe?.();
            await ai.dispose();
            await settled;
        })();
        return closing;
    }
    write({ ready: { protocol: HOST_PROTOCOL_VERSION, version: VERSION } });
    return { receive, close };
}
