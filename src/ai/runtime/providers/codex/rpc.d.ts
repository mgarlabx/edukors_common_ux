import type { ScopedLog } from "../../diagnostics.js";
import { type ManagedProcess } from "../../platform/process.js";
/**
 * JSON-RPC over a child process's pipes, one message per line, as Codex's
 * app server speaks it: without the `"jsonrpc"` field. Three kinds of
 * traffic: requests the client waits on, notifications from the server, and
 * requests from the server (an approval, a question) answered by the same id.
 */
export interface RpcHandlers {
    onNotification?: (method: string, params: any) => void;
    onRequest?: (method: string, params: any) => Promise<unknown>;
}
export interface Rpc {
    request<T = any>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
    notify(method: string, params?: unknown): void;
}
export declare function attachRpc(proc: ManagedProcess, handlers: RpcHandlers, log: ScopedLog): Rpc;
