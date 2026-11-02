import type { AccountContext } from "../provider.js";
import { type CommandSpec, type RunResult } from "./process.js";
/**
 * Runs a provider's sign-in command. Such commands open the browser and wait
 * for it; when the browser cannot be opened they print an address instead,
 * and some then wait for a code pasted on their input. The address goes to
 * the application (`context.login.prompt`), and a code the user pastes goes
 * to the command's input, so the whole flow works without a terminal.
 */
export interface LoginCommandOptions {
    /** The sign-in address among everything the command prints. */
    urlPattern: RegExp;
    acceptsCode: boolean;
    timeoutMs?: number;
}
export declare function runLoginCommand(spec: CommandSpec, context: AccountContext, options: LoginCommandOptions): Promise<RunResult>;
