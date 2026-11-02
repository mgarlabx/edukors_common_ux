import { PROVIDER_CATALOG } from "../../providerCatalog.js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import { AiError, toAiError } from "../../errors.js";
import { createToolMcpServer, TOOL_SERVER_NAME } from "../../mcp/toolServer.js";
import { listSkills } from "../../skills.js";
import { userToolDirs } from "../../platform/sandbox.js";
const PLUGIN_NAME = "edukors";
/**
 * The application's skills as a local Claude Code plugin, made in the
 * session's work dir: a manifest and a link to the skills folder. Returns the
 * plugin's path and the ids that enable those skills, and only those.
 */
function skillsPlugin(workDir, skillsDir) {
    const path = join(workDir, ".edukors-plugin");
    rmSync(path, { recursive: true, force: true });
    mkdirSync(join(path, ".claude-plugin"), { recursive: true });
    writeFileSync(join(path, ".claude-plugin", "plugin.json"), JSON.stringify({ name: PLUGIN_NAME, description: "Skills offered by the EDUKORS application." }) + "\n");
    // A junction on Windows needs no privileges; elsewhere the type is ignored.
    symlinkSync(skillsDir, join(path, "skills"), "junction");
    const ids = new Set();
    for (const skill of listSkills(skillsDir)) {
        ids.add(`${PLUGIN_NAME}:${skill.folder}`);
        ids.add(`${PLUGIN_NAME}:${skill.name}`);
    }
    return { path, ids: [...ids] };
}
import { compareVersions, findExecutable, readVersion } from "../../platform/discovery.js";
import { buildEnv } from "../../platform/env.js";
import { runLoginCommand } from "../../platform/login.js";
import { runCommand } from "../../platform/process.js";
import { interpret } from "./events.js";
/** Claude Code's file tools: confined to the working directories by --restricted, and checked again here. */
const READ_TOOLS = ["Read", "Glob", "Grep"];
const WRITE_TOOLS = ["Write", "Edit", "NotebookEdit"];
const WEB_TOOLS = ["WebFetch", "WebSearch"];
/** The built-in tools a workspace adds. */
export function workspaceTools(workspace) {
    return [...READ_TOOLS, ...WRITE_TOOLS, ...(workspace.web ? WEB_TOOLS : []), ...(workspace.shell ? ["Bash"] : [])];
}
/** A permission rule's absolute path: `//path`, and Windows paths in POSIX form (`C:\\x` → `//c/x`). */
const rulePath = (p) => "/" + p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase());
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
export function workspaceSettings(workspace, platform = process.platform, tempDir) {
    const readOnly = [...workspace.protectedPaths, ...workspace.readDirs].map(rulePath);
    const deny = readOnly.flatMap((p) => WRITE_TOOLS.flatMap((t) => [`${t}(${p})`, `${t}(${p}/**)`]));
    // Reading and the web are allowed outright. Writing and commands reach the permission handler, which puts them to
    // the application (Common: "review before applying" asks the person); the folder rules and the sandbox still apply.
    const permissions = { allow: [...READ_TOOLS, ...(workspace.web ? WEB_TOOLS : [])], deny, blockReadsOutsideWorkingDirectories: true };
    if (!workspace.shell)
        return { permissions };
    return {
        permissions,
        sandbox: {
            enabled: true,
            failIfUnavailable: true,
            autoAllowBashIfSandboxed: false,
            allowUnsandboxedCommands: false,
            filesystem: {
                denyRead: platform === "darwin" ? MACOS_PRIVATE : LINUX_PRIVATE,
                allowRead: [workspace.dir, ...workspace.readDirs, ...userToolDirs(), ...(tempDir ? [tempDir] : [])],
                allowWrite: [workspace.dir, ...(tempDir ? [tempDir] : [])],
                denyWrite: workspace.protectedPaths,
            },
        },
    };
}
/** Where macOS and Linux keep users' and temporary files. */
const MACOS_PRIVATE = ["~", "/Users", "/Volumes", "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"];
const LINUX_PRIVATE = ["~", "/home", "/root", "/tmp", "/var/tmp", "/mnt", "/media", "/srv", "/run/user"];
const within = (path, dir) => {
    const rel = relative(dir, path);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
/** The decision for a workspace tool that reaches the permission handler. */
export function workspaceDecision(workspace, toolName, input) {
    if (WEB_TOOLS.includes(toolName))
        return workspace.web ? null : "The web is not available here.";
    // Commands run in the sandbox, which writes only the workspace; without one, there are none.
    if (toolName === "Bash")
        return workspace.shell ? null : "Commands are not available here.";
    const writes = WRITE_TOOLS.includes(toolName);
    if (!writes && !READ_TOOLS.includes(toolName))
        return "This tool is not available here.";
    const raw = [input.file_path, input.notebook_path, input.path].find((v) => typeof v === "string");
    const path = raw === undefined ? workspace.dir : isAbsolute(raw) ? raw : join(workspace.dir, raw);
    if (writes) {
        if (!within(path, workspace.dir) || workspace.readDirs.some((d) => within(path, d)))
            return "Files can be written only in the working folder.";
        if (workspace.protectedPaths.some((p) => within(path, p)))
            return "That path belongs to the application; it changes only through the application's tools.";
        return null;
    }
    return [workspace.dir, ...workspace.readDirs].some((d) => within(path, d)) ? null : "Files can be read only in the working folder.";
}
/** What a writing tool or a command does, for the application's decision; null for reading and the web. */
export function nativeAction(workspace, toolName, input) {
    if (toolName === "Bash")
        return { action: "command", tool: toolName, command: String(input.command ?? "").slice(0, 2000), ...(input.description ? { description: String(input.description).slice(0, 300) } : {}) };
    if (!WRITE_TOOLS.includes(toolName))
        return null;
    const raw = [input.file_path, input.notebook_path, input.path].find((v) => typeof v === "string") ?? "";
    const path = raw && !isAbsolute(raw) ? join(workspace.dir, raw) : raw;
    return { action: toolName === "Write" && !existsSync(path) ? "create" : "edit", tool: toolName, path, relativePath: relative(workspace.dir, path) || path };
}
/** The address `claude auth login` prints for signing in without the browser it tried to open. */
const LOGIN_URL = /https:\/\/\S+\/oauth\/authorize\S*/;
/** Older builds miss parts of the protocol used here (effort, partial messages, auth status). */
const MIN_VERSION = "2.1.0";
const loadRealSdk = async () => (await import("@anthropic-ai/claude-agent-sdk"));
/** An npm install on Windows leaves a .cmd shim; the SDK needs what the shim runs. */
function unshim(path) {
    if (!path.toLowerCase().endsWith(".cmd"))
        return path;
    const pkg = join(dirname(path), "node_modules", "@anthropic-ai", "claude-code");
    return [join(pkg, "bin", "claude.exe"), join(pkg, "cli.js")].find((p) => existsSync(p)) ?? null;
}
const AuthStatus = z.looseObject({
    loggedIn: z.boolean(),
    authMethod: z.string().optional(),
    email: z.string().optional(),
    account: z.looseObject({ email: z.string().optional() }).optional(),
    orgName: z.string().optional(),
});
/** Logged out, Claude Code still reports `tokenSource: "none"`; a source counts only when it names one. */
export function signedIn(account) {
    if (!account)
        return false;
    if (account.apiProvider && account.apiProvider !== "firstParty")
        return true;
    const source = (s) => typeof s === "string" && s !== "" && s !== "none";
    return Boolean(account.email || account.subscriptionType || source(account.apiKeySource) || source(account.tokenSource));
}
/** The prompt of a streaming query: yields each message sent, and waits in between. */
class Inbox {
    items = [];
    waiting = [];
    closed = false;
    push(message) {
        const next = this.waiting.shift();
        if (next)
            next({ value: message, done: false });
        else
            this.items.push(message);
    }
    close() {
        this.closed = true;
        for (const next of this.waiting.splice(0))
            next({ value: undefined, done: true });
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => {
                const item = this.items.shift();
                if (item)
                    return Promise.resolve({ value: item, done: false });
                if (this.closed)
                    return Promise.resolve({ value: undefined, done: true });
                return new Promise((resolve) => this.waiting.push(resolve));
            },
        };
    }
}
function withTimeout(work, ms, message) {
    let timer;
    return Promise.race([work, new Promise((_, reject) => (timer = setTimeout(() => reject(new AiError("TIMEOUT", message)), ms)))]).finally(() => clearTimeout(timer));
}
export function createClaudeProvider(options = {}) {
    const minVersion = options.minVersion ?? MIN_VERSION;
    const builtIns = options.builtInTools ?? ["AskUserQuestion"];
    const loadSdk = options.loadSdk ?? loadRealSdk;
    const startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
    const env = (context) => buildEnv({
        // Extra variables first: they can never replace the account's directory.
        set: {
            ...options.env,
            CLAUDE_CONFIG_DIR: context.homeDir,
            CLAUDE_AGENT_SDK_CLIENT_APP: "edukors-common",
            CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
            CLAUDE_CODE_ENABLE_TASKS: "0",
            ENABLE_CLAUDEAI_MCP_SERVERS: "false",
            MAX_MCP_OUTPUT_TOKENS: "60000",
        },
    });
    const cli = (context, args, timeoutMs = 20_000) => runCommand({ file: context.detection.executable, args, env: env(context), timeoutMs, ...(context.signal ? { signal: context.signal } : {}) });
    const capabilities = {
        login: "browser",
        accountStatus: true,
        // Expected from the per-directory Keychain entry; verified with live accounts before release.
        multiAccount: true,
        logout: true,
        persistentSessions: true,
        models: true,
        efforts: true,
        usage: false,
        tools: true,
        questions: builtIns.includes("AskUserQuestion"),
        liveOptions: true,
        workspace: true,
        // Native Windows has no sandbox to confine commands: there a workspace has files and web only.
        workspaceShell: (options.platform ?? process.platform) !== "win32",
    };
    /** A query with no prompt yet: it starts Claude Code and initializes, without a model call. */
    async function initialize(context) {
        const sdk = await loadSdk();
        const inbox = new Inbox();
        const q = sdk.query({
            prompt: inbox,
            options: { cwd: context.homeDir, settingSources: [], strictMcpConfig: true, persistSession: false, env: env(context), pathToClaudeCodeExecutable: context.detection.executable },
        });
        try {
            return await withTimeout(q.initializationResult(), startupTimeoutMs, "Claude Code did not start in time");
        }
        finally {
            inbox.close();
            q.close();
        }
    }
    return {
        id: "claude",
        displayName: "Claude",
        installUrl: PROVIDER_CATALOG[0].url,
        async detect(log) {
            const found = await findExecutable({
                names: ["claude"],
                envVar: "EDUKORS_CLAUDE",
                ...(options.executable ? { override: options.executable } : {}),
                extraDirs: [join(homedir(), ".claude", "local")],
                ...(options.searchEnv ? { env: options.searchEnv } : {}),
            });
            const path = found ? unshim(found) : null;
            if (!path)
                return { providerId: "claude", status: "missing" };
            const version = await readVersion(path, ["--version"], buildEnv({ set: { ...options.env } }));
            if (!version) {
                log.warn("could not read the Claude Code version", { path });
                return { providerId: "claude", status: "error", executable: path, detail: "unrecognized version output" };
            }
            if (compareVersions(version, minVersion) < 0)
                return { providerId: "claude", status: "incompatible", executable: path, version, requiredVersion: minVersion };
            return { providerId: "claude", status: "ready", executable: path, version };
        },
        capabilities: () => capabilities,
        async connectAccount(context) {
            // Opens the browser and waits. Without one, the address it prints ends in a
            // code the user pastes; the application relays it to the command's input.
            const result = await runLoginCommand({ file: context.detection.executable, args: ["auth", "login", "--claudeai"], env: env(context) }, context, { urlPattern: LOGIN_URL, acceptsCode: true });
            if (result.timedOut)
                throw new AiError("TIMEOUT", "sign-in did not finish in time");
            if (result.code !== 0)
                throw new AiError("LOGIN_FAILED", "Claude sign-in failed", { meta: { detail: (result.stderr.trim() || result.stdout.trim()).slice(-300) } });
            return this.accountStatus(context);
        },
        async accountStatus(context) {
            // Exits 1 when signed out, still printing the JSON.
            const result = await cli(context, ["auth", "status", "--json"]);
            let parsed;
            try {
                parsed = AuthStatus.parse(JSON.parse(result.stdout));
            }
            catch (e) {
                throw new AiError("PROVIDER_PROTOCOL", "unexpected output from claude auth status", { cause: e, meta: { code: result.code } });
            }
            if (!parsed.loggedIn)
                return { state: "disconnected" };
            const identity = parsed.email ?? parsed.account?.email ?? parsed.orgName;
            return { state: "connected", ...(identity ? { identity } : {}) };
        },
        async logout(context) {
            const result = await cli(context, ["auth", "logout"]);
            if (result.code !== 0)
                throw new AiError("PROVIDER_ERROR", "Claude sign-out failed", { meta: { detail: result.stderr.trim().slice(-300) } });
        },
        async listModels(context) {
            const init = await initialize(context);
            return init.models.map((m) => ({
                id: m.value,
                label: m.displayName,
                ...(m.supportedEffortLevels?.length ? { efforts: [...m.supportedEffortLevels] } : {}),
                ...(m.value === "default" ? { default: true } : {}),
            }));
        },
        openSession: async (context, hooks) => ClaudeSession.open(await loadSdk(), context, hooks, { env: env(context), builtIns, startupTimeoutMs, platform: options.platform ?? process.platform }),
    };
}
class ClaudeSession {
    q;
    inbox;
    log;
    hooks;
    tempDir;
    resumeId;
    pending = null;
    closing = false;
    pump = Promise.resolve();
    constructor(q, inbox, log, hooks, sessionId, 
    /** The session's own temporary folder, in a workspace with commands; removed when it ends. */
    tempDir) {
        this.q = q;
        this.inbox = inbox;
        this.log = log;
        this.hooks = hooks;
        this.tempDir = tempDir;
        this.resumeId = sessionId;
    }
    static async open(sdk, context, hooks, opts) {
        const sessionId = context.resumeId ?? randomUUID();
        const inbox = new Inbox();
        let session = null;
        const idle = Promise.resolve({ content: "No request is active.", isError: true });
        // In-process MCP servers: the application's tools, and each of the user's servers through the core.
        const servers = {};
        if (context.tools.length) {
            const instance = createToolMcpServer(context.tools, (name, args) => (session?.pending ? session.pending.sink.callTool(name, args) : idle));
            servers[TOOL_SERVER_NAME] = { type: "sdk", name: TOOL_SERVER_NAME, instance };
        }
        for (const external of context.externalServers) {
            const instance = createToolMcpServer(external.tools, (name, args) => (session?.pending ? session.pending.sink.callExternal(external.name, name, args) : idle), external.name);
            servers[external.name] = { type: "sdk", name: external.name, instance };
        }
        const plugin = context.skillsDir ? skillsPlugin(context.workDir, context.skillsDir) : null;
        const served = Object.keys(servers);
        const workspace = context.workspace;
        // A temporary folder of the session's own, short enough for Claude Code's sockets: the shared
        // per-user one (/tmp/claude-<uid>) also holds the user's other Claude Code sessions.
        const tempDir = workspace?.shell ? realpathSync(mkdtempSync(join(tmpdir(), "edk-"))) : null;
        // The one place that decides. The application's tools validate themselves and the
        // user's servers are authorized by the core; loading a skill only reads its text.
        const canUseTool = async (toolName, input) => {
            if (served.some((name) => toolName.startsWith(`mcp__${name}__`)))
                return { behavior: "allow", updatedInput: input };
            if (toolName === "Skill" && plugin)
                return { behavior: "allow", updatedInput: input };
            if (toolName === "AskUserQuestion")
                return session ? session.answerQuestions(input) : { behavior: "deny", message: "No request is active." };
            if (workspace && workspaceTools(workspace).includes(toolName)) {
                const refusal = workspaceDecision(workspace, toolName, input);
                if (refusal)
                    return { behavior: "deny", message: refusal };
                // Creating or editing a file and running a command are put to the application first.
                const action = nativeAction(workspace, toolName, input);
                if (action) {
                    const sink = session?.pending?.sink;
                    const decision = sink?.authorizeNative ? await sink.authorizeNative(action) : { allow: false, message: "No request is active." };
                    if (!decision.allow)
                        return { behavior: "deny", message: decision.message || "The user declined this action." };
                }
                return { behavior: "allow", updatedInput: input };
            }
            return { behavior: "deny", message: "This tool is not available here." };
        };
        const q = sdk.query({
            prompt: inbox,
            options: {
                cwd: workspace?.dir ?? context.workDir,
                ...(context.resumeId ? { resume: context.resumeId } : { sessionId }),
                ...(context.options.model ? { model: context.options.model } : {}),
                ...(context.options.effort ? { effort: context.options.effort } : {}),
                ...(context.instructions ? { systemPrompt: context.instructions } : {}),
                tools: [...opts.builtIns, ...(workspace ? workspaceTools(workspace) : []), ...(plugin ? ["Skill"] : [])],
                ...(workspace
                    ? {
                        additionalDirectories: workspace.readDirs,
                        settings: workspaceSettings(workspace, opts.platform, tempDir ?? undefined),
                        // Confines the file tools to the working directories and keeps settings files out of reach.
                        extraArgs: { restricted: null },
                    }
                    : {}),
                mcpServers: servers,
                ...(plugin ? { plugins: [{ type: "local", path: plugin.path }], skills: plugin.ids } : {}),
                strictMcpConfig: true,
                settingSources: [],
                canUseTool,
                includePartialMessages: true,
                persistSession: true,
                env: tempDir ? { ...opts.env, CLAUDE_CODE_TMPDIR: tempDir } : opts.env,
                pathToClaudeCodeExecutable: context.detection.executable,
                stderr: (text) => context.log.debug(`claude: ${text.trimEnd()}`),
            },
        });
        session = new ClaudeSession(q, inbox, context.log, hooks, sessionId, tempDir);
        session.pump = session.run();
        try {
            const init = await withTimeout(q.initializationResult(), opts.startupTimeoutMs, "Claude Code did not start in time");
            if (!signedIn(init.account))
                throw new AiError("ACCOUNT_DISCONNECTED", "Claude is not signed in on this account");
        }
        catch (e) {
            await session.close();
            throw toAiError(e, "PROVIDER_START_FAILED");
        }
        return session;
    }
    send(input, sink) {
        if (this.pending)
            return Promise.reject(new AiError("SESSION_BUSY", "a turn is already running"));
        if (this.closing)
            return Promise.reject(new AiError("SESSION_CLOSED", "the session is closed"));
        return new Promise((resolve, reject) => {
            this.pending = { requestId: input.requestId, sink, error: null, resolve, reject };
            const text = input.context ? `${input.text}\n\n<document>\n${input.context}\n</document>` : input.text;
            this.inbox.push({ type: "user", uuid: input.requestId, session_id: this.resumeId ?? "", parent_tool_use_id: null, message: { role: "user", content: text } });
        });
    }
    async interrupt() {
        if (this.pending)
            await this.q.interrupt();
    }
    async updateOptions(options) {
        if (options.model !== undefined)
            await this.q.setModel(options.model || undefined);
        if (options.effort !== undefined)
            await this.q.applyFlagSettings({ effortLevel: (options.effort || null) });
    }
    async close() {
        if (this.closing)
            return this.pump;
        this.closing = true;
        this.inbox.close();
        try {
            this.q.close();
        }
        catch (e) {
            this.log.debug("claude close", e);
        }
        await withTimeout(this.pump, 10_000, "Claude Code did not stop in time").catch((e) => this.log.warn("claude did not stop", e));
        this.removeTempDir();
        this.settle((p) => p.reject(new AiError("SESSION_CLOSED", "the session was closed")));
    }
    removeTempDir() {
        if (this.tempDir)
            rmSync(this.tempDir, { recursive: true, force: true });
    }
    /** Claude Code's own question tool: each question goes to the user, and the answers back as its input. */
    async answerQuestions(input) {
        const pending = this.pending;
        if (!pending)
            return { behavior: "deny", message: "No request is active." };
        const questions = Array.isArray(input.questions) ? input.questions : [];
        const answers = {};
        try {
            for (const q of questions) {
                const prompt = String(q.question ?? "");
                if (!prompt)
                    continue;
                const options = (q.options ?? []).map((o) => String(o.label ?? "")).filter(Boolean);
                answers[prompt] = await pending.sink.ask({ prompt, ...(options.length ? { options } : {}) });
            }
        }
        catch {
            return { behavior: "deny", message: "The user did not answer." };
        }
        return { behavior: "allow", updatedInput: { ...input, answers } };
    }
    async run() {
        let failure = null;
        try {
            for await (const msg of this.q)
                this.handle(msg);
        }
        catch (e) {
            failure = e;
        }
        if (this.closing)
            return;
        this.removeTempDir();
        const error = new AiError("PROVIDER_CRASHED", "Claude Code stopped unexpectedly", { cause: failure ?? undefined });
        this.hooks.exited(error);
        this.settle((p) => p.reject(error));
    }
    handle(msg) {
        for (const action of interpret(msg)) {
            if (action.kind === "sessionId") {
                this.resumeId = action.id;
                continue;
            }
            const pending = this.pending;
            if (!pending)
                continue;
            switch (action.kind) {
                case "text":
                    pending.sink.text(action.text);
                    break;
                case "activity":
                    pending.sink.activity(action.phase);
                    break;
                case "usage":
                    pending.sink.usage(action.usage);
                    break;
                case "error":
                    pending.error = action.error;
                    break;
                case "end":
                    this.settle((p) => (p.error && action.outcome === "completed" && p.error.code !== "PROVIDER_ERROR" ? p.reject(p.error) : p.resolve(action.outcome)));
                    break;
                case "fail":
                    this.settle((p) => p.reject(p.error ?? action.error));
                    break;
            }
        }
    }
    settle(fn) {
        const pending = this.pending;
        this.pending = null;
        if (pending)
            fn(pending);
    }
}
