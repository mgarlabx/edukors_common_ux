/**
 * Stable error codes. Applications translate these into actionable language;
 * the raw provider message belongs in redacted diagnostics, not the main UI.
 */
export declare const ERROR_CODES: readonly ["PROVIDER_UNKNOWN", "CLI_MISSING", "CLI_INCOMPATIBLE", "CAPABILITY_UNSUPPORTED", "ACCOUNT_NOT_FOUND", "ACCOUNT_DISCONNECTED", "ACCOUNT_EXPIRED", "LOGIN_FAILED", "SESSION_CLOSED", "SESSION_BUSY", "QUESTION_NOT_FOUND", "PROVIDER_START_FAILED", "PROVIDER_CRASHED", "PROVIDER_PROTOCOL", "PROVIDER_ERROR", "RATE_LIMITED", "TIMEOUT", "CANCELLED", "TOOL_NOT_FOUND", "TOOL_INVALID_ARGUMENTS", "TOOL_FAILED", "TOOL_DENIED", "REGISTRY_LOCKED", "REGISTRY_CORRUPT", "REGISTRY_TOO_NEW", "INVALID_ARGUMENT", "INTERNAL"];
export type ErrorCode = (typeof ERROR_CODES)[number];
export type ErrorMeta = Record<string, string | number | boolean | null | undefined>;
export interface SerializedError {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    meta?: ErrorMeta;
}
export declare class AiCliError extends Error {
    readonly code: ErrorCode;
    readonly meta: ErrorMeta | undefined;
    readonly retryable: boolean;
    constructor(code: ErrorCode, message: string, options?: {
        meta?: ErrorMeta;
        cause?: unknown;
        retryable?: boolean;
    });
    toJSON(): SerializedError;
}
export declare const isAiCliError: (value: unknown) => value is AiCliError;
/** Wraps anything thrown into an AiCliError, keeping the original as the cause. */
export declare function toAiCliError(value: unknown, fallback?: ErrorCode): AiCliError;
