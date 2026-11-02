import { z } from "zod";
/**
 * Application-owned tools. The AI requests an operation; the application
 * validates and applies it through its normal state-management path.
 */
export interface ToolResult {
    /** What the model reads back. */
    content: string;
    isError?: boolean;
}
export interface ToolCallContext {
    documentId: string;
    requestId: string;
    /** The `callId` of this call's toolStarted/toolCompleted events. */
    callId: string;
    /** Aborted when the request is interrupted or the session closes. */
    signal: AbortSignal;
}
/** What crosses to a provider: no code, only a description and a JSON Schema. */
export interface ToolSpec {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
export type ValidationResult = {
    ok: true;
    value: Record<string, unknown>;
} | {
    ok: false;
    message: string;
};
export interface ToolDefinition extends ToolSpec {
    /** Rejects malformed arguments before `run` sees them. Without it, arguments reach `run` unchecked. */
    validate?: (args: unknown) => ValidationResult;
    run: (args: Record<string, unknown>, context: ToolCallContext) => Promise<ToolResult> | ToolResult;
}
/** A tool whose arguments are described and validated by a zod object schema. */
export declare function defineTool<S extends z.ZodObject>(definition: {
    name: string;
    description: string;
    input: S;
    run: (args: z.infer<S>, context: ToolCallContext) => Promise<ToolResult> | ToolResult;
}): ToolDefinition;
export declare function assertToolNames(tools: readonly ToolSpec[]): void;
export declare const toolSpec: ({ name, description, inputSchema }: ToolSpec) => ToolSpec;
