import type { Readable, Writable } from "node:stream";
import type { AiCli } from "../engine.js";
import type { HostDispatcherOptions } from "./dispatcher.js";
export { HOST_PROTOCOL_VERSION } from "./dispatcher.js";
/** The application-host protocol over a pipe, one JSON object per line (see dispatcher.js). */
export interface StdioHostOptions {
    ai: AiCli;
    input: Readable;
    output: Writable;
    /** How long the app has to answer a tool call. */
    toolTimeoutMs?: number;
    methods?: HostDispatcherOptions["methods"];
}
export declare function runStdioHost({ ai, input, output, toolTimeoutMs, methods }: StdioHostOptions): {
    closed: Promise<void>;
};
