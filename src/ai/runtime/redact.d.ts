export interface RedactOptions {
    /** Replaced with `~`. Defaults to the current OS user's home. */
    home?: string;
}
export declare function redactText(text: string, options?: RedactOptions): string;
/** Deep copy with sensitive keys dropped and every string redacted. */
export declare function redactValue(value: unknown, options?: RedactOptions, depth?: number): unknown;
