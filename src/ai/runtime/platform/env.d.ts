/** Where user-level CLIs are commonly installed but GUI-launched apps often lack on PATH. */
export declare function commonBinDirs(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string[];
export interface BuildEnvOptions {
    base?: NodeJS.ProcessEnv;
    /** Provider-specific variables, applied last. `undefined` removes a variable. */
    set?: Record<string, string | undefined>;
    /** Directories appended to PATH when absent (e.g. the executable's own directory). */
    extraPath?: string[];
    platform?: NodeJS.Platform;
}
/** An explicit environment for a provider process. */
export declare function buildEnv(options?: BuildEnvOptions): Record<string, string>;
