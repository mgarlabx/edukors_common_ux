import { TOOL_SERVER_NAME } from "../constants.js";
const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const isStringMap = (v) => isObject(v) && Object.values(v).every((x) => typeof x === "string");
function server(name, raw) {
    if (name === TOOL_SERVER_NAME)
        return { code: "reserved", server: name };
    // Letters, digits, `_` and `-`: the name becomes part of tool names and of Codex's config keys.
    if (!NAME.test(name))
        return { code: "badName", server: name };
    if (!isObject(raw))
        return { code: "notObject", server: name };
    if (raw.timeout !== undefined && !(typeof raw.timeout === "number" && raw.timeout > 0))
        return { code: "badField", server: name, field: "timeout" };
    const timeout = typeof raw.timeout === "number" ? { timeout: raw.timeout } : {};
    const type = raw.type ?? "stdio";
    if (type === "stdio") {
        if (typeof raw.command !== "string" || !raw.command.trim())
            return { code: "noCommand", server: name };
        if (raw.args !== undefined && !isStrings(raw.args))
            return { code: "badField", server: name, field: "args" };
        if (raw.env !== undefined && !isStringMap(raw.env))
            return { code: "badField", server: name, field: "env" };
        return { type: "stdio", command: raw.command, ...(raw.args ? { args: raw.args } : {}), ...(raw.env ? { env: raw.env } : {}), ...timeout };
    }
    if (type === "http" || type === "sse") {
        if (typeof raw.url !== "string" || !/^https?:\/\/\S+$/.test(raw.url))
            return { code: "noUrl", server: name };
        if (raw.headers !== undefined && !isStringMap(raw.headers))
            return { code: "badField", server: name, field: "headers" };
        return { type, url: raw.url, ...(raw.headers ? { headers: raw.headers } : {}), ...timeout };
    }
    return { code: "badType", server: name, detail: String(type) };
}
/** The valid servers, and every problem found. Empty text is no servers. */
export function parseMcpConfig(input) {
    let raw = input;
    if (typeof input === "string") {
        if (!input.trim())
            return { servers: {}, problems: [] };
        try {
            raw = JSON.parse(input);
        }
        catch (e) {
            return { servers: {}, problems: [{ code: "notJson", detail: e instanceof Error ? e.message : String(e) }] };
        }
    }
    const list = isObject(raw) && "mcpServers" in raw ? raw.mcpServers : raw;
    if (!isObject(list))
        return { servers: {}, problems: [{ code: "notServers" }] };
    const servers = {};
    const problems = [];
    for (const [name, entry] of Object.entries(list)) {
        const parsed = server(name, entry);
        if ("code" in parsed)
            problems.push(parsed);
        else
            servers[name] = parsed;
    }
    return { servers, problems };
}
