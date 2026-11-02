import type { AiCli } from "../engine.js";
/** See dispatcher.js for the messages. */
export declare const HOST_PROTOCOL_VERSION = 1;
export type HostMessage = Record<string, unknown>;
export interface HostDispatcherOptions {
    ai: AiCli;
    /** Delivers one message to the application. */
    send: (message: HostMessage) => void;
    /** How long the app has to answer a tool call. */
    toolTimeoutMs?: number;
    /** Requests that belong to the embedding host: name → handler. */
    methods?: Record<string, (params: any) => unknown | Promise<unknown>>;
}
export interface HostDispatcher {
    /** One message from the application (already parsed from its transport). */
    receive(message: unknown): void;
    /** The application went away; disposes the library. */
    close(): Promise<void>;
}
export declare function createHostDispatcher(options: HostDispatcherOptions): HostDispatcher;
