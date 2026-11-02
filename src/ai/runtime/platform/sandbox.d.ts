/**
 * The macOS system sandbox (Seatbelt, through `sandbox-exec`) around a
 * provider process that works in a workspace: it reads only the folders
 * named here and the system's, writes only the writable ones, and never the
 * protected paths. Everything the process starts inherits it, commands
 * included.
 *
 * A process inside it cannot apply a sandbox of its own (`sandbox_apply:
 * Operation not permitted`), so the provider must be told that its commands
 * already run in an external sandbox.
 */
export declare const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
export interface SandboxPaths {
    /** Read and written: the workspace, the account's home, the session's scratch space. */
    writable: string[];
    /** Read only: the workspace's extra folders, the provider's and Node's installation. */
    readable: string[];
    /** Never written, though inside a writable folder. */
    protectedPaths: string[];
}
/** What the system and a CLI installed the usual ways need to read to start. */
export declare function runtimeDirs(executable: string, realExecutable: string): string[];
/** Where the usual version managers keep the tools a command may run (Node, Bun, Python). */
export declare function userToolDirs(): string[];
/** What a command needs to read on macOS besides its workspace: the system and installed tools, not users' or temporary files. */
export declare const MACOS_SYSTEM_READABLE: string[];
export declare function seatbeltPolicy(paths: SandboxPaths): string;
/** The command line that runs `file args` inside the sandbox. */
export declare function sandboxed(file: string, args: string[], paths: SandboxPaths): {
    file: string;
    args: string[];
};
