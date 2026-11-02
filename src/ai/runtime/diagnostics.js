import { redactText, redactValue } from "./redact.js";
/**
 * A bounded, redacted log. Everything recorded here is safe to export: the
 * redaction happens on the way in, so a forgotten call site cannot leak.
 */
export class Diagnostics {
    capacity;
    sink;
    entries = [];
    constructor(capacity = 500, sink) {
        this.capacity = capacity;
        this.sink = sink;
    }
    log(level, scope, message, meta) {
        const entry = { at: new Date().toISOString(), level, scope, message: redactText(message) };
        if (meta !== undefined)
            entry.meta = redactValue(meta);
        this.entries.push(entry);
        if (this.entries.length > this.capacity)
            this.entries.splice(0, this.entries.length - this.capacity);
        this.sink?.(entry);
    }
    scoped(scope) {
        return {
            debug: (message, meta) => this.log("debug", scope, message, meta),
            info: (message, meta) => this.log("info", scope, message, meta),
            warn: (message, meta) => this.log("warn", scope, message, meta),
            error: (message, meta) => this.log("error", scope, message, meta),
        };
    }
    snapshot() {
        return this.entries.slice();
    }
}
