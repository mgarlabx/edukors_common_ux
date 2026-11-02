/**
 * Finding a provider's executable the way a terminal would. Applications
 * opened from a desktop shell often have a short PATH, so common install
 * directories and, on POSIX, the user's login shell are consulted too.
 */
export interface FindOptions {
    /** Executable names, without extension (e.g. `["claude"]`). */
    names: string[];
    /** Variable holding an explicit path, from advanced settings or tests. */
    envVar?: string;
    /** Explicit path from advanced settings; takes precedence over everything. */
    override?: string;
    extraDirs?: string[];
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    /** Ask the login shell as a last resort (POSIX only). Default true. */
    loginShell?: boolean;
}
export declare function findExecutable(options: FindOptions): Promise<string | null>;
/** The first `x.y.z` in the output of `<executable> --version`. */
export declare function readVersion(file: string, args?: string[], env?: Record<string, string>): Promise<string | undefined>;
/** Compares dotted numeric versions; pre-release suffixes are ignored. */
export declare function compareVersions(a: string, b: string): number;
