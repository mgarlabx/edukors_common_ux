/**
 * Stable error codes. Applications translate these into actionable language;
 * the raw provider message belongs in redacted diagnostics, not the main UI.
 */
export const ERROR_CODES = [
    "PROVIDER_UNKNOWN",
    "CLI_MISSING",
    "CLI_INCOMPATIBLE",
    "CAPABILITY_UNSUPPORTED",
    "ACCOUNT_NOT_FOUND",
    "ACCOUNT_DISCONNECTED",
    "ACCOUNT_EXPIRED",
    "LOGIN_FAILED",
    "SESSION_CLOSED",
    "SESSION_BUSY",
    "QUESTION_NOT_FOUND",
    "PROVIDER_START_FAILED",
    "PROVIDER_CRASHED",
    "PROVIDER_PROTOCOL",
    "PROVIDER_ERROR",
    "RATE_LIMITED",
    "TIMEOUT",
    "CANCELLED",
    "TOOL_NOT_FOUND",
    "TOOL_INVALID_ARGUMENTS",
    "TOOL_FAILED",
    "TOOL_DENIED",
    "REGISTRY_LOCKED",
    "REGISTRY_CORRUPT",
    "REGISTRY_TOO_NEW",
    "INVALID_ARGUMENT",
    "INTERNAL",
];
/** Codes where trying again later, without user action, can succeed. */
const RETRYABLE = new Set(["PROVIDER_CRASHED", "RATE_LIMITED", "TIMEOUT", "REGISTRY_LOCKED", "SESSION_BUSY"]);
export class AiError extends Error {
    code;
    meta;
    retryable;
    constructor(code, message, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "AiError";
        this.code = code;
        this.meta = options.meta;
        this.retryable = options.retryable ?? RETRYABLE.has(code);
    }
    toJSON() {
        return { code: this.code, message: this.message, retryable: this.retryable, ...(this.meta ? { meta: this.meta } : {}) };
    }
}
export const isAiError = (value) => value instanceof AiError;
/** Wraps anything thrown into an AiError, keeping the original as the cause. */
export function toAiError(value, fallback = "INTERNAL") {
    if (value instanceof AiError)
        return value;
    const message = value instanceof Error ? value.message : String(value);
    return new AiError(fallback, message, { cause: value });
}
