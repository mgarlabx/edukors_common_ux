import type { ProviderAdapter } from "../provider.js";
/**
 * An adapter for fixtures/fake-ai.mjs. It is written the way a real adapter
 * is: detection, sign-in and status through short commands, a long-running
 * process for the session, runtime validation of everything it reads.
 * Applications can use it to test their integration without any account.
 */
export declare const FAKE_CLI_PATH: string;
export interface FakeProviderOptions {
    id?: string;
    /** Defaults to running fixtures/fake-ai.mjs with the current Node. */
    command?: {
        file: string;
        args: string[];
    };
    minVersion?: string;
    multiAccount?: boolean;
    /** Whether a workspace may run commands, as on a platform with a sandbox. Default true. */
    workspaceShell?: boolean;
    /** Extra variables for the fake CLI (FAKE_AI_VERSION, FAKE_AI_LOGIN, ...). */
    env?: Record<string, string>;
    startupTimeoutMs?: number;
}
export declare function createFakeProvider(options?: FakeProviderOptions): ProviderAdapter;
