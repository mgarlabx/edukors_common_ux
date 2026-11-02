import { type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";
export interface CommandSpec {
    file: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
}
/** Keeps the last `limit` characters of a stream. */
export declare class Tail {
    private readonly limit;
    private text;
    constructor(limit?: number);
    push(chunk: string): void;
    toString(): string;
}
export interface ExitInfo {
    code: number | null;
    signal: NodeJS.Signals | null;
}
export declare class ManagedProcess {
    readonly child: ChildProcessWithoutNullStreams;
    readonly stderr: Tail;
    readonly exited: Promise<ExitInfo>;
    private exitInfo;
    constructor(spec: CommandSpec);
    get running(): boolean;
    /** Writes one JSON object followed by a newline. Returns false if the process is gone. */
    writeLine(message: unknown): boolean;
    /** Ends the whole process tree: a polite signal, then a forced one after `graceMs`. */
    terminate(graceMs?: number): Promise<ExitInfo>;
}
/** Kills every process this library started. Safe to call from `process.on("exit")`. */
export declare function killAllSync(): void;
export interface RunResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
/** Runs a short command to completion with a timeout and bounded output. Never rejects for a non-zero exit. */
export declare function runCommand(spec: CommandSpec & {
    timeoutMs?: number;
    maxOutput?: number;
    signal?: AbortSignal;
    input?: string;
}): Promise<RunResult>;
/**
 * Splits a stream into lines. A line longer than `maxLineBytes` is discarded
 * and reported, so a misbehaving process cannot exhaust memory.
 */
export declare function readLines(stream: Readable, onLine: (line: string) => void, options?: {
    maxLineBytes?: number;
    onOverflow?: () => void;
}): void;
