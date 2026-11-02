export type LogLevel = "debug" | "info" | "warn" | "error";
export interface DiagnosticEntry {
    at: string;
    level: LogLevel;
    scope: string;
    message: string;
    meta?: unknown;
}
export type LogSink = (entry: DiagnosticEntry) => void;
/**
 * A bounded, redacted log. Everything recorded here is safe to export: the
 * redaction happens on the way in, so a forgotten call site cannot leak.
 */
export declare class Diagnostics {
    private readonly capacity;
    private readonly sink?;
    private readonly entries;
    constructor(capacity?: number, sink?: LogSink | undefined);
    log(level: LogLevel, scope: string, message: string, meta?: unknown): void;
    scoped(scope: string): ScopedLog;
    snapshot(): DiagnosticEntry[];
}
export interface ScopedLog {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
}
